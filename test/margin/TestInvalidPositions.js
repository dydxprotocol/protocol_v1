/*global artifacts, web3, contract, describe, it*/

const BigNumber = require('bignumber.js');
const Margin = artifacts.require("Margin");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const {
  createOpenTx,
  issueTokensAndSetAllowancesForShort,
  callOpenPosition,
  callCancelLoanOffer,
  doShort,
  issueTokensAndSetAllowancesForClose,
  callClosePosition
} = require('../helpers/MarginHelper');
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
    contract('Margin', accounts => {
      it('fails on invalid order signature', async () => {
        const OpenTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.buyOrder.ecSignature.v = '0x01';

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on invalid loan offer signature', async () => {
        const OpenTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.loanOffering.signature.v = '0x01';

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if short amount is 0', async () => {
        const OpenTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.shortAmount = new BigNumber(0);

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on invalid loan offer taker', async () => {
        const OpenTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.loanOffering.taker = OpenTx.buyOrder.maker;
        OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too high amount', async () => {
        const OpenTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowancesForShort(OpenTx);

        OpenTx.shortAmount = OpenTx.loanOffering.rates.maxAmount.plus(new BigNumber(1));

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too low quote token amount', async () => {
        const OpenTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowancesForShort(OpenTx);

        OpenTx.loanOffering.rates.minQuoteToken = BIGNUMBERS.BASE_AMOUNT.times(100);
        OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too low short amount', async () => {
        const OpenTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowancesForShort(OpenTx);

        OpenTx.shortAmount = OpenTx.loanOffering.rates.minAmount.minus(1);

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if the loan offer is expired', async () => {
        const OpenTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.loanOffering.expirationTimestamp = 100;
        OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if loan offer already filled', async () => {
        const OpenTx = await createOpenTx(accounts);

        // Set 2x balances
        await Promise.all([
          issueTokensAndSetAllowancesForShort(OpenTx),
          issueTokensAndSetAllowancesForShort(OpenTx)
        ]);

        OpenTx.loanOffering.rates.maxAmount = OpenTx.shortAmount;
        OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

        const dydxMargin = await Margin.deployed();

        // First should succeed
        await callOpenPosition(dydxMargin, OpenTx, /*safely=*/ false);

        await expectThrow( callOpenPosition(dydxMargin, OpenTx, /*safely=*/ false));
      });
    });

    contract('Margin', accounts => {
      it('fails if loan offer canceled', async () => {
        const OpenTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowancesForShort(OpenTx);
        const dydxMargin = await Margin.deployed();

        await callCancelLoanOffer(
          dydxMargin,
          OpenTx.loanOffering,
          OpenTx.loanOffering.rates.maxAmount
        );

        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if buy order canceled', async () => {
        const OpenTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowancesForShort(OpenTx);
        const exchange = await ZeroExExchange.deployed();

        await callCancelOrder(
          exchange,
          OpenTx.buyOrder,
          OpenTx.buyOrder.makerTokenAmount
        );

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });
  });

  describe('Balances', () => {
    contract('Margin', accounts => {
      it('fails on insufficient seller balance', async () => {
        const OpenTx = await createOpenTx(accounts);

        const storedAmount = OpenTx.depositAmount;
        OpenTx.depositAmount = OpenTx.depositAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.depositAmount = storedAmount;

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient lender balance', async () => {
        const OpenTx = await createOpenTx(accounts);

        const storedAmount = OpenTx.loanOffering.rates.maxAmount;
        OpenTx.loanOffering.rates.maxAmount = OpenTx.shortAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.depositAmount = storedAmount;

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient buyer balance', async () => {
        const OpenTx = await createOpenTx(accounts);

        const storedAmount = OpenTx.buyOrder.makerTokenAmount;
        OpenTx.buyOrder.makerTokenAmount = getPartialAmount(
          OpenTx.buyOrder.makerTokenAmount,
          OpenTx.buyOrder.takerTokenAmount,
          OpenTx.shortAmount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.buyOrder.makerTokenAmount = storedAmount;

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient buyer fee balance', async () => {
        const OpenTx = await createOpenTx(accounts);

        const storedAmount = OpenTx.buyOrder.makerFee;
        OpenTx.buyOrder.makerFee = getPartialAmount(
          OpenTx.buyOrder.makerFee,
          OpenTx.buyOrder.takerTokenAmount,
          OpenTx.shortAmount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.buyOrder.makerFee = storedAmount;

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient lender fee balance', async () => {
        const OpenTx = await createOpenTx(accounts);

        const storedAmount = OpenTx.loanOffering.rates.lenderFee;
        OpenTx.loanOffering.rates.lenderFee = getPartialAmount(
          OpenTx.loanOffering.rates.lenderFee,
          OpenTx.loanOffering.rates.maxAmount,
          OpenTx.shortAmount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.loanOffering.rates.lenderFee = storedAmount;

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient short seller fee balance', async () => {
        const OpenTx = await createOpenTx(accounts);

        const storedAmount = OpenTx.loanOffering.rates.takerFee;
        const storedAmount2 = OpenTx.buyOrder.takerFee;
        OpenTx.loanOffering.rates.takerFee = getPartialAmount(
          OpenTx.loanOffering.rates.takerFee,
          OpenTx.loanOffering.rates.maxAmount,
          OpenTx.shortAmount
        ).minus(new BigNumber(1));
        OpenTx.buyOrder.takerFee = getPartialAmount(
          OpenTx.buyOrder.takerFee,
          OpenTx.buyOrder.takerTokenAmount,
          OpenTx.shortAmount
        );
        await issueTokensAndSetAllowancesForShort(OpenTx);
        OpenTx.loanOffering.rates.takerFee = storedAmount;
        OpenTx.buyOrder.takerFee = storedAmount2;

        const dydxMargin = await Margin.deployed();
        await expectThrow( callOpenPosition(dydxMargin, OpenTx));
      });
    });
  });
});

describe('#closePosition', () => {
  describe('Access', () => {
    contract('Margin', accounts => {
      it('Does not allow lender to close', async() => {
        const OpenTx = await doShort(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        OpenTx.seller = OpenTx.loanOffering.payer;
        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        await expectThrow( callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount));
      });
    });

    contract('Margin', accounts => {
      it('Does not allow external address to close', async() => {
        const OpenTx = await doShort(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        OpenTx.seller = accounts[7];
        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        await expectThrow( callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount));
      });
    });
  });

  describe('Validations', () => {
    contract('Margin', accounts => {
      it('Enforces that short sell exists', async() => {
        const OpenTx = await doShort(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        OpenTx.id = "0x123";
        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        await expectThrow( callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount));
      });
    });

    contract('Margin', accounts => {
      it('Only allows short to be entirely closed once', async() => {
        const OpenTx = await doShort(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        // First should succeed
        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        await callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount);

        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        await expectThrow( callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount));
      });
    });

    contract('Margin', accounts => {
      it('Fails if interest fee cannot be paid', async() => {
        const OpenTx = await createOpenTx(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        // Set the interest fee super high so it can't be paid
        OpenTx.loanOffering.rates.interestRate = new BigNumber('4000e6');
        OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

        await issueTokensAndSetAllowancesForShort(OpenTx);
        const tx = await callOpenPosition(dydxMargin, OpenTx);

        OpenTx.id = tx.id;
        OpenTx.response = tx;

        // Wait for interest fee to accrue
        await wait(OpenTx.loanOffering.maxDuration);

        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        await expectThrow( callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount));
      });
    });

    contract('Margin', accounts => {
      it('Fails on invalid order signature', async() => {
        const OpenTx = await doShort(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        sellOrder.ecSignature.r = "0x123";

        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        await expectThrow( callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount));
      });
    });

    contract('Margin', accounts => {
      it('Fails if sell order is not large enough', async() => {
        const OpenTx = await doShort(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        sellOrder.makerTokenAmount = OpenTx.shortAmount.minus(new BigNumber(1));
        sellOrder.ecSignature = await signOrder(sellOrder);

        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        await expectThrow( callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount));
      });
    });
  });

  describe('Balances', () => {
    contract('Margin', accounts => {
      it('Fails on insufficient sell order balance/allowance', async() => {
        const OpenTx = await doShort(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.makerTokenAmount;
        sellOrder.makerTokenAmount = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        sellOrder.makerTokenAmount = amountSave;
        await expectThrow( callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount));
      });
    });

    contract('Margin', accounts => {
      it('Fails on insufficient sell order fee token balance/allowance', async() => {
        const OpenTx = await doShort(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.makerFee;
        sellOrder.makerFee = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        sellOrder.makerFee = amountSave;
        await expectThrow( callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount));
      });
    });

    contract('Margin', accounts => {
      it('Fails on insufficient short seller fee token balance/allowance', async() => {
        const OpenTx = await doShort(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.takerFee;
        sellOrder.takerFee = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
        sellOrder.takerFee = amountSave;
        await expectThrow( callClosePosition(dydxMargin, OpenTx, sellOrder, OpenTx.shortAmount));
      });
    });
  });
});
