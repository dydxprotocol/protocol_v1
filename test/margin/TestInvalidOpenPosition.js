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
        const openTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(openTx);
        openTx.buyOrder.ecSignature.v = '0x01';

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on invalid loan offer signature', async () => {
        const openTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(openTx);
        openTx.loanOffering.signature.v = '0x01';

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if margin amount is 0', async () => {
        const openTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(openTx);
        openTx.amount = new BigNumber(0);

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on invalid loan offer taker', async () => {
        const openTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(openTx);
        openTx.loanOffering.taker = openTx.buyOrder.maker;
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too high amount', async () => {
        const openTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(openTx);

        openTx.amount = openTx.loanOffering.rates.maxAmount.plus(new BigNumber(1));

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too low quote token amount', async () => {
        const openTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(openTx);

        openTx.loanOffering.rates.minQuoteToken = BIGNUMBERS.BASE_AMOUNT.times(100);
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too low margin amount', async () => {
        const openTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(openTx);

        openTx.amount = openTx.loanOffering.rates.minAmount.minus(1);

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if the loan offer is expired', async () => {
        const openTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(openTx);
        openTx.loanOffering.expirationTimestamp = 100;
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if loan offer already filled', async () => {
        const openTx = await createMarginTradeTx(accounts);

        // Set 2x balances
        await Promise.all([
          issueTokensAndSetAllowancesFor(openTx),
          issueTokensAndSetAllowancesFor(openTx)
        ]);

        openTx.loanOffering.rates.maxAmount = openTx.amount;
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        const margin = await Margin.deployed();

        // First should succeed
        await callOpenPosition(margin, openTx, /*safely=*/ false);

        await expectThrow( callOpenPosition(margin, openTx, /*safely=*/ false));
      });
    });

    contract('Margin', accounts => {
      it('fails if loan offer canceled', async () => {
        const openTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(openTx);
        const margin = await Margin.deployed();

        await callCancelLoanOffer(
          margin,
          openTx.loanOffering,
          openTx.loanOffering.rates.maxAmount
        );

        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if buy order canceled', async () => {
        const openTx = await createMarginTradeTx(accounts);

        await issueTokensAndSetAllowancesFor(openTx);
        const exchange = await ZeroExExchange.deployed();

        await callCancelOrder(
          exchange,
          openTx.buyOrder,
          openTx.buyOrder.makerTokenAmount
        );

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });
  });

  describe('Balances', () => {
    contract('Margin', accounts => {
      it('fails on insufficient trader balance', async () => {
        const openTx = await createMarginTradeTx(accounts);

        const storedAmount = openTx.depositAmount;
        openTx.depositAmount = openTx.depositAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesFor(openTx);
        openTx.depositAmount = storedAmount;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient lender balance', async () => {
        const openTx = await createMarginTradeTx(accounts);

        const storedAmount = openTx.loanOffering.rates.maxAmount;
        openTx.loanOffering.rates.maxAmount = openTx.amount.minus(new BigNumber(1));
        await issueTokensAndSetAllowancesFor(openTx);
        openTx.depositAmount = storedAmount;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient buyer balance', async () => {
        const openTx = await createMarginTradeTx(accounts);

        const storedAmount = openTx.buyOrder.makerTokenAmount;
        openTx.buyOrder.makerTokenAmount = getPartialAmount(
          openTx.buyOrder.makerTokenAmount,
          openTx.buyOrder.takerTokenAmount,
          openTx.amount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesFor(openTx);
        openTx.buyOrder.makerTokenAmount = storedAmount;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient buyer fee balance', async () => {
        const openTx = await createMarginTradeTx(accounts);

        const storedAmount = openTx.buyOrder.makerFee;
        openTx.buyOrder.makerFee = getPartialAmount(
          openTx.buyOrder.makerFee,
          openTx.buyOrder.takerTokenAmount,
          openTx.amount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesFor(openTx);
        openTx.buyOrder.makerFee = storedAmount;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient lender fee balance', async () => {
        const openTx = await createMarginTradeTx(accounts);

        const storedAmount = openTx.loanOffering.rates.lenderFee;
        openTx.loanOffering.rates.lenderFee = getPartialAmount(
          openTx.loanOffering.rates.lenderFee,
          openTx.loanOffering.rates.maxAmount,
          openTx.amount
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowancesFor(openTx);
        openTx.loanOffering.rates.lenderFee = storedAmount;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient margin trader fee balance', async () => {
        const openTx = await createMarginTradeTx(accounts);

        const storedAmount = openTx.loanOffering.rates.takerFee;
        const storedAmount2 = openTx.buyOrder.takerFee;
        openTx.loanOffering.rates.takerFee = getPartialAmount(
          openTx.loanOffering.rates.takerFee,
          openTx.loanOffering.rates.maxAmount,
          openTx.amount
        ).minus(new BigNumber(1));
        openTx.buyOrder.takerFee = getPartialAmount(
          openTx.buyOrder.takerFee,
          openTx.buyOrder.takerTokenAmount,
          openTx.amount
        );
        await issueTokensAndSetAllowancesFor(openTx);
        openTx.loanOffering.rates.takerFee = storedAmount;
        openTx.buyOrder.takerFee = storedAmount2;

        const margin = await Margin.deployed();
        await expectThrow( callOpenPosition(margin, openTx));
      });
    });
  });
});

describe('#closePosition', () => {
  describe('Access', () => {
    contract('Margin', accounts => {
      it('Does not allow lender to close', async() => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        openTx.trader = openTx.loanOffering.payer;
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow( callClosePosition(margin, openTx, sellOrder, openTx.amount));
      });
    });

    contract('Margin', accounts => {
      it('Does not allow external address to close', async() => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        openTx.trader = accounts[7];
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow( callClosePosition(margin, openTx, sellOrder, openTx.amount));
      });
    });
  });

  describe('Validations', () => {
    contract('Margin', accounts => {
      it('Enforces that the margin position exists', async() => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        openTx.id = "0x123";
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow( callClosePosition(margin, openTx, sellOrder, openTx.amount));
      });
    });

    contract('Margin', accounts => {
      it('Only allows the position to be entirely closed once', async() => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        // First should succeed
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await callClosePosition(margin, openTx, sellOrder, openTx.amount);

        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow( callClosePosition(margin, openTx, sellOrder, openTx.amount));
      });
    });

    contract('Margin', accounts => {
      it('Fails if interest fee cannot be paid', async() => {
        const openTx = await createMarginTradeTx(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        // Set the interest fee super high so it can't be paid
        openTx.loanOffering.rates.interestRate = new BigNumber('4000e6');
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        await issueTokensAndSetAllowancesFor(openTx);
        const tx = await callOpenPosition(margin, openTx);

        openTx.id = tx.id;
        openTx.response = tx;

        // Wait for interest fee to accrue
        await wait(openTx.loanOffering.maxDuration);

        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow( callClosePosition(margin, openTx, sellOrder, openTx.amount));
      });
    });

    contract('Margin', accounts => {
      it('Fails on invalid order signature', async() => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        sellOrder.ecSignature.r = "0x123";

        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow( callClosePosition(margin, openTx, sellOrder, openTx.amount));
      });
    });

    contract('Margin', accounts => {
      it('Fails if sell order is not large enough', async() => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        sellOrder.makerTokenAmount = openTx.amount.minus(new BigNumber(1));
        sellOrder.ecSignature = await signOrder(sellOrder);

        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow( callClosePosition(margin, openTx, sellOrder, openTx.amount));
      });
    });
  });

  describe('Balances', () => {
    contract('Margin', accounts => {
      it('Fails on insufficient sell order balance/allowance', async() => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.makerTokenAmount;
        sellOrder.makerTokenAmount = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        sellOrder.makerTokenAmount = amountSave;
        await expectThrow( callClosePosition(margin, openTx, sellOrder, openTx.amount));
      });
    });

    contract('Margin', accounts => {
      it('Fails on insufficient sell order fee token balance/allowance', async() => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.makerFee;
        sellOrder.makerFee = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        sellOrder.makerFee = amountSave;
        await expectThrow( callClosePosition(margin, openTx, sellOrder, openTx.amount));
      });
    });

    contract('Margin', accounts => {
      it('Fails on insufficient margin trader fee token balance/allowance', async() => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, margin] = await Promise.all([
          createSignedSellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.takerFee;
        sellOrder.takerFee = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        sellOrder.takerFee = amountSave;
        await expectThrow( callClosePosition(margin, openTx, sellOrder, openTx.amount));
      });
    });
  });
});
