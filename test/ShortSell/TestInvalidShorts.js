/*global artifacts, contract, describe, it*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');
const ShortSell = artifacts.require("ShortSell");
const assertInvalidOpcode = require('../helpers/assertInvalidOpcode');

const {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  signLoanOffering,
  getPartialAmount
} = require('../helpers/ShortSellHelper');

contract('ShortSell', function(accounts) {
  describe('#short', () => {
    describe('Validations', () => {
      it('fails on invalid order signature', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.buyOrder.ecSignature.v = '0x01';

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });

      it('fails on invalid loan offer signature', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.signature.v = '0x01';

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });

      it('fails on invalid loan offer taker', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.taker = shortTx.buyOrder.maker;
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });

      it('fails on too high amount', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);

        shortTx.shortAmount = shortTx.loanOffering.rates.maxAmount.plus(new BigNumber(1));

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });

      it('fails on too low deposit amount', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);

        shortTx.depositAmount = getPartialAmount(
          shortTx.shortAmount,
          shortTx.loanOffering.rates.maxAmount,
          shortTx.loanOffering.rates.minimumDeposit
        ).minus(new BigNumber(1));

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });

      it('fails on too low short amount', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);

        shortTx.depositAmount = shortTx.loanOffering.rates.minAmount.minus(new BigNumber(1));

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });

      it('fails if the loan offer is expired', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.expirationTimestamp = 100;
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });

      it('fails if the order price is lower than the minimum sell price', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.rates.minimumSellAmount = getPartialAmount(
          shortTx.buyOrder.makerTokenAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.loanOffering.rates.maxAmount
        ).plus(new BigNumber(1));
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });
    });

    describe('Balances', () => {
      it('fails on insufficient seller balance', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        const storedAmount = shortTx.depositAmount;
        shortTx.depositAmount = shortTx.depositAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.depositAmount = storedAmount;

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });

      it('fails on insufficient lender balance', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        const storedAmount = shortTx.loanOffering.rates.maxAmount;
        shortTx.loanOffering.rates.maxAmount = shortTx.shortAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.depositAmount = storedAmount;

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });

      it('fails on insufficient buyer balance', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        const storedAmount = shortTx.buyOrder.makerTokenAmount;
        shortTx.buyOrder.makerTokenAmount = getPartialAmount(
          shortTx.buyOrder.makerTokenAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.shortAmount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.buyOrder.makerTokenAmount = storedAmount;

        try {
          await callShort(shortSell, shortTx);
          throw new Error('Did not throw');
        } catch (e) {
          assertInvalidOpcode(e);
        }
      });
    });
  });
});
