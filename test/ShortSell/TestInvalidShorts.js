/*global artifacts, web3, contract, describe, it*/

const BigNumber = require('bignumber.js');
const ShortSell = artifacts.require("ShortSell");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  callCancelLoanOffer,
  doShort,
  issueTokensAndSetAllowancesForClose,
  callCloseShort
} = require('../helpers/ShortSellHelper');
const {
  signLoanOffering
} = require('../helpers/LoanHelper');
const {
  getPartialAmount
} = require('../helpers/MathHelper');
const {
  createSignedSellOrder,
  signOrder
} = require('../helpers/0xHelper');
const { callCancelOrder } = require('../helpers/ExchangeHelper');
const { wait } = require('@digix/tempo')(web3);
const { expectThrow } = require('../helpers/ExpectHelper');
const { BIGNUMBERS } = require('../helpers/Constants');

describe('#short', () => {
  describe('Validations', () => {
    contract('ShortSell', accounts => {
      it('fails on invalid order signature', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.buyOrder.ecSignature.v = '0x01';

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
      it('fails on invalid loan offer signature', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.signature.v = '0x01';

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
      it('fails if short amount is 0', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.shortAmount = new BigNumber(0);

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
      it('fails on invalid loan offer taker', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.taker = shortTx.buyOrder.maker;
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
      it('fails on too high amount', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);

        shortTx.shortAmount = shortTx.loanOffering.rates.maxAmount.plus(new BigNumber(1));

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
      it('fails on too low quote token amount', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);

        shortTx.loanOffering.rates.minQuoteToken = BIGNUMBERS.BASE_AMOUNT.times(100);
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
      it('fails on too low short amount', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);

        shortTx.shortAmount = shortTx.loanOffering.rates.minAmount.minus(1);

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
      it('fails if the loan offer is expired', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.loanOffering.expirationTimestamp = 100;
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
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
        await callShort(shortSell, shortTx, /*safely=*/ false);

        await expectThrow(() => callShort(shortSell, shortTx, /*safely=*/ false));
      });
    });

    contract('ShortSell', accounts => {
      it('fails if loan offer canceled', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        const shortSell = await ShortSell.deployed();

        await callCancelLoanOffer(
          shortSell,
          shortTx.loanOffering,
          shortTx.loanOffering.rates.maxAmount
        );

        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
      it('fails if buy order canceled', async () => {
        const shortTx = await createShortSellTx(accounts);

        await issueTokensAndSetAllowancesForShort(shortTx);
        const exchange = await ZeroExExchange.deployed();

        await callCancelOrder(
          exchange,
          shortTx.buyOrder,
          shortTx.buyOrder.makerTokenAmount
        );

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });
  });

  describe('Balances', () => {
    contract('ShortSell', accounts => {
      it('fails on insufficient seller balance', async () => {
        const shortTx = await createShortSellTx(accounts);

        const storedAmount = shortTx.depositAmount;
        shortTx.depositAmount = shortTx.depositAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.depositAmount = storedAmount;

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
      it('fails on insufficient lender balance', async () => {
        const shortTx = await createShortSellTx(accounts);

        const storedAmount = shortTx.loanOffering.rates.maxAmount;
        shortTx.loanOffering.rates.maxAmount = shortTx.shortAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(shortTx);
        shortTx.depositAmount = storedAmount;

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
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

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
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

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
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

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });

    contract('ShortSell', accounts => {
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

        const shortSell = await ShortSell.deployed();
        await expectThrow(() => callShort(shortSell, shortTx));
      });
    });
  });
});

describe('#closeShort', () => {
  describe('Access', () => {
    contract('ShortSell', accounts => {
      it('Does not allow lender to close', async() => {
        const shortTx = await doShort(accounts);
        const [sellOrder, shortSell] = await Promise.all([
          createSignedSellOrder(accounts),
          ShortSell.deployed()
        ]);

        shortTx.seller = shortTx.loanOffering.lender;
        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount));
      });
    });

    contract('ShortSell', accounts => {
      it('Does not allow external address to close', async() => {
        const shortTx = await doShort(accounts);
        const [sellOrder, shortSell] = await Promise.all([
          createSignedSellOrder(accounts),
          ShortSell.deployed()
        ]);

        shortTx.seller = accounts[7];
        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount));
      });
    });
  });

  describe('Validations', () => {
    contract('ShortSell', accounts => {
      it('Enforces that short sell exists', async() => {
        const shortTx = await doShort(accounts);
        const [sellOrder, shortSell] = await Promise.all([
          createSignedSellOrder(accounts),
          ShortSell.deployed()
        ]);

        shortTx.id = "0x123";
        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount));
      });
    });

    contract('ShortSell', accounts => {
      it('Only allows short to be entirely closed once', async() => {
        const shortTx = await doShort(accounts);
        const [sellOrder, shortSell] = await Promise.all([
          createSignedSellOrder(accounts),
          ShortSell.deployed()
        ]);

        // First should succeed
        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        await callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount);

        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount));
      });
    });

    contract('ShortSell', accounts => {
      it('Fails if interest fee cannot be paid', async() => {
        const shortTx = await createShortSellTx(accounts);
        const [sellOrder, shortSell] = await Promise.all([
          createSignedSellOrder(accounts),
          ShortSell.deployed()
        ]);

        // Set the interest fee super high so it can't be paid
        shortTx.loanOffering.rates.interestRate = new BigNumber('4000e6');
        shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

        await issueTokensAndSetAllowancesForShort(shortTx);
        const tx = await callShort(shortSell, shortTx);

        shortTx.id = tx.id;
        shortTx.response = tx;

        // Wait for interest fee to accrue
        await wait(shortTx.loanOffering.maxDuration);

        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount));
      });
    });

    contract('ShortSell', accounts => {
      it('Fails on invalid order signature', async() => {
        const shortTx = await doShort(accounts);
        const [sellOrder, shortSell] = await Promise.all([
          createSignedSellOrder(accounts),
          ShortSell.deployed()
        ]);

        sellOrder.ecSignature.r = "0x123";

        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount));
      });
    });

    contract('ShortSell', accounts => {
      it('Fails if sell order is not large enough', async() => {
        const shortTx = await doShort(accounts);
        const [sellOrder, shortSell] = await Promise.all([
          createSignedSellOrder(accounts),
          ShortSell.deployed()
        ]);

        sellOrder.makerTokenAmount = shortTx.shortAmount.minus(new BigNumber(1));
        sellOrder.ecSignature = await signOrder(sellOrder);

        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount));
      });
    });
  });

  describe('Balances', () => {
    contract('ShortSell', accounts => {
      it('Fails on insufficient sell order balance/allowance', async() => {
        const shortTx = await doShort(accounts);
        const [sellOrder, shortSell] = await Promise.all([
          createSignedSellOrder(accounts),
          ShortSell.deployed()
        ]);

        const amountSave = sellOrder.makerTokenAmount;
        sellOrder.makerTokenAmount = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        sellOrder.makerTokenAmount = amountSave;
        await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount));
      });
    });

    contract('ShortSell', accounts => {
      it('Fails on insufficient sell order fee token balance/allowance', async() => {
        const shortTx = await doShort(accounts);
        const [sellOrder, shortSell] = await Promise.all([
          createSignedSellOrder(accounts),
          ShortSell.deployed()
        ]);

        const amountSave = sellOrder.makerFee;
        sellOrder.makerFee = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        sellOrder.makerFee = amountSave;
        await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount));
      });
    });

    contract('ShortSell', accounts => {
      it('Fails on insufficient short seller fee token balance/allowance', async() => {
        const shortTx = await doShort(accounts);
        const [sellOrder, shortSell] = await Promise.all([
          createSignedSellOrder(accounts),
          ShortSell.deployed()
        ]);

        const amountSave = sellOrder.takerFee;
        sellOrder.takerFee = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
        sellOrder.takerFee = amountSave;
        await expectThrow(() => callCloseShort(shortSell, shortTx, sellOrder, shortTx.shortAmount));
      });
    });
  });
});
