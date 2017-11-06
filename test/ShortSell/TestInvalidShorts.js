/*global artifacts, contract, describe, it*/

const BigNumber = require('bignumber.js');
const ShortSell = artifacts.require("ShortSell");
const Exchange = artifacts.require("Exchange");
const assertInvalidOpcode = require('../helpers/assertInvalidOpcode');
const {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  signLoanOffering,
  getPartialAmount,
  callCancelLoanOffer
} = require('../helpers/ShortSellHelper');
const { callCancelOrder } = require('../helpers/ExchangeHelper');

async function expectThrow(shortTx) {
  const shortSell = await ShortSell.deployed();
  try {
    await callShort(shortSell, shortTx);
    throw new Error('Did not throw');
  } catch (e) {
    assertInvalidOpcode(e);
  }
}

contract('ShortSell', function(accounts) {
  describe('#short', () => {
    describe('Validations', () => {
      it('fails on invalid order signature', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.buyOrder.ecSignature.v = '0x01';

        await expectThrow(shortTx);
      });

      it('fails on invalid loan offer signature', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.signature.v = '0x01';

        await expectThrow(shortTx);
      });

      it('fails on invalid loan offer taker', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.taker = shortTx.buyOrder.maker;
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        await expectThrow(shortTx);
      });

      it('fails on too high amount', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);

        shortTx.shortAmount = shortTx.loanOffering.rates.maxAmount.plus(new BigNumber(1));

        await expectThrow(shortTx);
      });

      it('fails on too low deposit amount', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);

        shortTx.depositAmount = getPartialAmount(
          shortTx.shortAmount,
          shortTx.loanOffering.rates.maxAmount,
          shortTx.loanOffering.rates.minimumDeposit
        ).minus(new BigNumber(1));

        await expectThrow(shortTx);
      });

      it('fails on too low short amount', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);

        shortTx.depositAmount = shortTx.loanOffering.rates.minAmount.minus(new BigNumber(1));

        await expectThrow(shortTx);
      });

      it('fails if the loan offer is expired', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.expirationTimestamp = 100;
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        await expectThrow(shortTx);
      });

      it('fails if the order price is lower than the minimum sell price', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.rates.minimumSellAmount = getPartialAmount(
          shortTx.buyOrder.makerTokenAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.loanOffering.rates.maxAmount
        ).plus(new BigNumber(1));
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        await expectThrow(shortTx);
      });

      it('fails if loan offer already filled', async () => {
        const shortTx = await createShortSellTx(accounts);

        // Set 2x balances
        await Promise.all([
          issueTokensAndSetAllowancesForShort(shortTx),
          issueTokensAndSetAllowancesForShort(shortTx)
        ]);

        shortTx.loanOffering.rates.maxAmount = shortTx.shortAmount;
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        const shortSell = await ShortSell.deployed();

        // First should succeed
        await callShort(shortSell, shortTx);

        await expectThrow(shortTx);
      });

      it('fails if loan offer canceled', async () => {
        const shortTx = await createShortSellTx(accounts);

        const shortSell = await ShortSell.deployed();

        await callCancelLoanOffer(
          shortSell,
          shortTx.loanOffering,
          shortTx.loanOffering.rates.maxAmount
        );

        await expectThrow(shortTx);
      });

      it('fails if buy order canceled', async () => {
        const shortTx = await createShortSellTx(accounts);

        const exchange = await Exchange.deployed();

        await callCancelOrder(
          exchange,
          shortTx.buyOrder,
          shortTx.buyOrder.makerTokenAmount
        );

        await expectThrow(shortTx);
      });
    });

    describe('Balances', () => {
      it('fails on insufficient seller balance', async () => {
        const shortTx = await createShortSellTx(accounts);

        const storedAmount = shortTx.depositAmount;
        shortTx.depositAmount = shortTx.depositAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.depositAmount = storedAmount;

        await expectThrow(shortTx);
      });

      it('fails on insufficient lender balance', async () => {
        const shortTx = await createShortSellTx(accounts);

        const storedAmount = shortTx.loanOffering.rates.maxAmount;
        shortTx.loanOffering.rates.maxAmount = shortTx.shortAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.depositAmount = storedAmount;

        await expectThrow(shortTx);
      });

      it('fails on insufficient buyer balance', async () => {
        const shortTx = await createShortSellTx(accounts);

        const storedAmount = shortTx.buyOrder.makerTokenAmount;
        shortTx.buyOrder.makerTokenAmount = getPartialAmount(
          shortTx.buyOrder.makerTokenAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.shortAmount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.buyOrder.makerTokenAmount = storedAmount;

        await expectThrow(shortTx);
      });

      it('fails on insufficient buyer fee balance', async () => {
        const shortTx = await createShortSellTx(accounts);

        const storedAmount = shortTx.buyOrder.makerFee;
        shortTx.buyOrder.makerFee = getPartialAmount(
          shortTx.buyOrder.makerFee,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.shortAmount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.buyOrder.makerFee = storedAmount;

        await expectThrow(shortTx);
      });

      it('fails on insufficient lender fee balance', async () => {
        const shortTx = await createShortSellTx(accounts);

        const storedAmount = shortTx.loanOffering.rates.lenderFee;
        shortTx.loanOffering.rates.lenderFee = getPartialAmount(
          shortTx.loanOffering.rates.lenderFee,
          shortTx.loanOffering.rates.maxAmount,
          shortTx.shortAmount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.rates.lenderFee = storedAmount;

        await expectThrow(shortTx);
      });

      it('fails on insufficient short seller fee balance', async () => {
        const shortTx = await createShortSellTx(accounts);

        const storedAmount = shortTx.loanOffering.rates.takerFee;
        const storedAmount2 = shortTx.buyOrder.takerFee;
        shortTx.loanOffering.rates.takerFee = getPartialAmount(
          shortTx.loanOffering.rates.takerFee,
          shortTx.loanOffering.rates.maxAmount,
          shortTx.shortAmount
        ).minus(new BigNumber(1));
        shortTx.buyOrder.takerFee = getPartialAmount(
          shortTx.buyOrder.takerFee,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.shortAmount
        );
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.rates.takerFee = storedAmount;
        shortTx.buyOrder.takerFee = storedAmount2;

        await expectThrow(shortTx);
      });
    });
  });
});
