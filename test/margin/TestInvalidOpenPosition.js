/*global artifacts, web3, contract, describe, it*/

const BigNumber = require('bignumber.js');
const Margin = artifacts.require("Margin");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const {
  createMarginTradeTx,
  issueTokensAndSetAllowancesFor,
  callOpenPosition,
  callCancelLoanOffer,
  doOpenPosition,
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

describe('#openPosition', () => {
  describe('Validations', () => {
    contract('Margin', accounts => {
      it('fails on invalid order signature', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.buyOrder.ecSignature.v = '0x01';

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on invalid loan offer signature', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.loanOffering.signature.v = '0x01';

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if margin amount is 0', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.marginAmount = new BigNumber(0);

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on invalid loan offer taker', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.loanOffering.taker = OpenPositionTx.buyOrder.maker;
        OpenPositionTx.loanOffering.signature = await signLoanOffering(OpenPositionTx.loanOffering);

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too high amount', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);

        OpenPositionTx.marginAmount = OpenPositionTx.loanOffering.rates.maxAmount.plus(new BigNumber(1));

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too low quote token amount', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);

        OpenPositionTx.loanOffering.rates.minQuoteToken = BIGNUMBERS.BASE_AMOUNT.times(100);
        OpenPositionTx.loanOffering.signature = await signLoanOffering(OpenPositionTx.loanOffering);

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too low margin amount', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);

        OpenPositionTx.marginAmount = OpenPositionTx.loanOffering.rates.minAmount.minus(1);

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if the loan offer is expired', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.loanOffering.expirationTimestamp = 100;
        OpenPositionTx.loanOffering.signature = await signLoanOffering(OpenPositionTx.loanOffering);

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if loan offer already filled', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        // Set 2x balances
        await Promise.all([
          issueTokensAndSetAllowancesFor(OpenPositionTx),
          issueTokensAndSetAllowancesFor(OpenPositionTx)
        ]);

        OpenPositionTx.loanOffering.rates.maxAmount = OpenPositionTx.marginAmount;
        OpenPositionTx.loanOffering.signature = await signLoanOffering(OpenPositionTx.loanOffering);

        const margin = await Margin.deployed();

        // First should succeed
        await callOpenPosition(margin, OpenPositionTx, /*safely=*/ false);

        await expectThrow( callOpenPosition(margin, OpenPositionTx, /*safely=*/ false));
      });
    });

    contract('Margin', accounts => {
      it('fails if loan offer canceled', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        const margin = await Margin.deployed();

        await callCancelLoanOffer(
          margin,
          OpenPositionTx.loanOffering,
          OpenPositionTx.loanOffering.rates.maxAmount
        );

        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if buy order canceled', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        const exchange = await ZeroExExchange.deployed();

        await callCancelOrder(
          exchange,
          OpenPositionTx.buyOrder,
          OpenPositionTx.buyOrder.makerTokenAmount
        );

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });
  });

  describe('Balances', () => {
    contract('Margin', accounts => {
      it('fails on insufficient trader balance', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        const storedAmount = OpenPositionTx.depositAmount;
        OpenPositionTx.depositAmount = OpenPositionTx.depositAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.depositAmount = storedAmount;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient lender balance', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        const storedAmount = OpenPositionTx.loanOffering.rates.maxAmount;
        OpenPositionTx.loanOffering.rates.maxAmount = OpenPositionTx.marginAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.depositAmount = storedAmount;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient buyer balance', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        const storedAmount = OpenPositionTx.buyOrder.makerTokenAmount;
        OpenPositionTx.buyOrder.makerTokenAmount = getPartialAmount(
          OpenPositionTx.buyOrder.makerTokenAmount,
          OpenPositionTx.buyOrder.takerTokenAmount,
          OpenPositionTx.marginAmount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.buyOrder.makerTokenAmount = storedAmount;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient buyer fee balance', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        const storedAmount = OpenPositionTx.buyOrder.makerFee;
        OpenPositionTx.buyOrder.makerFee = getPartialAmount(
          OpenPositionTx.buyOrder.makerFee,
          OpenPositionTx.buyOrder.takerTokenAmount,
          OpenPositionTx.marginAmount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.buyOrder.makerFee = storedAmount;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient lender fee balance', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        const storedAmount = OpenPositionTx.loanOffering.rates.lenderFee;
        OpenPositionTx.loanOffering.rates.lenderFee = getPartialAmount(
          OpenPositionTx.loanOffering.rates.lenderFee,
          OpenPositionTx.loanOffering.rates.maxAmount,
          OpenPositionTx.marginAmount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.loanOffering.rates.lenderFee = storedAmount;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient margin trader fee balance', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);

        const storedAmount = OpenPositionTx.loanOffering.rates.takerFee;
        const storedAmount2 = OpenPositionTx.buyOrder.takerFee;
        OpenPositionTx.loanOffering.rates.takerFee = getPartialAmount(
          OpenPositionTx.loanOffering.rates.takerFee,
          OpenPositionTx.loanOffering.rates.maxAmount,
          OpenPositionTx.marginAmount
        ).minus(new BigNumber(1));
        OpenPositionTx.buyOrder.takerFee = getPartialAmount(
          OpenPositionTx.buyOrder.takerFee,
          OpenPositionTx.buyOrder.takerTokenAmount,
          OpenPositionTx.marginAmount
        );
        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        OpenPositionTx.loanOffering.rates.takerFee = storedAmount;
        OpenPositionTx.buyOrder.takerFee = storedAmount2;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, OpenPositionTx));
      });
    });
  });
});

describe('#closePosition', () => {
  describe('Access', () => {
    contract('Margin', accounts => {
      it('Does not allow lender to close', async() => {
        const OpenPositionTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        OpenPositionTx.trader = OpenPositionTx.loanOffering.payer;
        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount));
      });
    });

    contract('Margin', accounts => {
      it('Does not allow external address to close', async() => {
        const OpenPositionTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        OpenPositionTx.trader = accounts[7];
        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount));
      });
    });
  });

  describe('Validations', () => {
    contract('Margin', accounts => {
      it('Enforces that the margin position exists', async() => {
        const OpenPositionTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        OpenPositionTx.id = "0x123";
        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount));
      });
    });

    contract('Margin', accounts => {
      it('Only allows the position to be entirely closed once', async() => {
        const OpenPositionTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        // First should succeed
        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        await callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount);

        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount));
      });
    });

    contract('Margin', accounts => {
      it('Fails if interest fee cannot be paid', async() => {
        const OpenPositionTx = await createMarginTradeTx(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        // Set the interest fee super high so it can't be paid
        OpenPositionTx.loanOffering.rates.interestRate = new BigNumber('4000e6');
        OpenPositionTx.loanOffering.signature = await signLoanOffering(OpenPositionTx.loanOffering);

        await issueTokensAndSetAllowancesFor(OpenPositionTx);
        const tx = await callOpenPosition(margin, OpenPositionTx);

        OpenPositionTx.id = tx.id;
        OpenPositionTx.response = tx;

        // Wait for interest fee to accrue
        await wait(OpenPositionTx.loanOffering.maxDuration);

        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount));
      });
    });

    contract('Margin', accounts => {
      it('Fails on invalid order signature', async() => {
        const OpenPositionTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        sellOrder.ecSignature.r = "0x123";

        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount));
      });
    });

    contract('Margin', accounts => {
      it('Fails if sell order is not large enough', async() => {
        const OpenPositionTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        sellOrder.makerTokenAmount = OpenPositionTx.marginAmount.minus(new BigNumber(1));
        sellOrder.ecSignature = await signOrder(sellOrder);

        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount));
      });
    });
  });

  describe('Balances', () => {
    contract('Margin', accounts => {
      it('Fails on insufficient sell order balance/allowance', async() => {
        const OpenPositionTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.makerTokenAmount;
        sellOrder.makerTokenAmount = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        sellOrder.makerTokenAmount = amountSave;
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount));
      });
    });

    contract('Margin', accounts => {
      it('Fails on insufficient sell order fee token balance/allowance', async() => {
        const OpenPositionTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.makerFee;
        sellOrder.makerFee = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        sellOrder.makerFee = amountSave;
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount));
      });
    });

    contract('Margin', accounts => {
      it('Fails on insufficient margin trader fee token balance/allowance', async() => {
        const OpenPositionTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.takerFee;
        sellOrder.takerFee = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
        sellOrder.takerFee = amountSave;
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, OpenPositionTx.marginAmount));
      });
    });
  });
});
