const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const OwedToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const TestSmartContractLender = artifacts.require("TestSmartContractLender");
const TokenProxy = artifacts.require("TokenProxy");
const { ZeroExExchangeV1 } = require('../../contracts/ZeroExV1');

const {
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition,
  callCancelLoanOffer,
  doOpenPosition,
  getMinimumDeposit,
  issueTokensAndSetAllowancesForClose,
  callClosePosition,
  issueForDirectClose
} = require('../../helpers/MarginHelper');
const {
  signLoanOffering
} = require('../../helpers/LoanHelper');
const {
  getPartialAmount
} = require('../../helpers/MathHelper');
const {
  createSignedV1SellOrder,
  signOrder
} = require('../../helpers/ZeroExV1Helper');
const { callCancelOrder } = require('../../helpers/ExchangeHelper');
const { wait } = require('@digix/tempo')(web3);
const { expectThrow } = require('../../helpers/ExpectHelper');
const { ADDRESSES, BYTES } = require('../../helpers/Constants');

describe('#openPosition', () => {
  describe('Validations', () => {
    contract('Margin', accounts => {
      it('fails on invalid order signature', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);
        openTx.buyOrder.ecSignature.v = '0x01';

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on invalid loan offer signature', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);
        openTx.loanOffering.signature = BYTES.BAD_SIGNATURE;

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if position principal is 0', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);
        openTx.principal = new BigNumber(0);

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on invalid loan offer taker', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);
        openTx.loanOffering.taker = openTx.buyOrder.maker;
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on invalid loan offer position owner', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);
        openTx.loanOffering.positionOwner = openTx.buyOrder.maker;
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too high amount', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);

        openTx.principal = openTx.loanOffering.rates.maxAmount.plus(new BigNumber(1));

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too low heldToken amount', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);

        openTx.loanOffering.rates.minHeldToken = openTx.loanOffering.rates.minHeldToken.times(17);
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on too low position principal', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);

        openTx.principal = openTx.loanOffering.rates.minAmount.minus(1);

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if the loan offer is expired', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);
        openTx.loanOffering.expirationTimestamp = 100;
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if the loan offer has 0 maxDuration', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);
        openTx.loanOffering.maxDuration = 0;
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      async function getLoanFill(dydxMargin, openTx) {
        const result = await dydxMargin.getLoanFilledAmount.call(openTx.loanOffering.loanHash);
        return result;
      }
      it('fails if loan offer already filled', async () => {
        const openTx = await createOpenTx(accounts);

        const halfLoanAmount = openTx.loanOffering.rates.maxAmount.div(2).floor();
        openTx.principal = halfLoanAmount;
        openTx.depositAmount = getMinimumDeposit(openTx);

        const dydxMargin = await Margin.deployed();

        const fill0 = await getLoanFill(dydxMargin, openTx);
        expect(fill0).to.be.bignumber.equal(0);

        // first call should succeed for 1/2
        openTx.nonce = 1;
        await issueTokensAndSetAllowances(openTx);
        await callOpenPosition(dydxMargin, openTx);

        const fill1 = await getLoanFill(dydxMargin, openTx);
        expect(fill1).to.be.bignumber.equal(halfLoanAmount);

        // second call should succeed for 1/2
        openTx.nonce = 2;
        await issueTokensAndSetAllowances(openTx);
        await callOpenPosition(dydxMargin, openTx);

        const fill2 = await getLoanFill(dydxMargin, openTx);
        expect(fill2).to.be.bignumber.equal(halfLoanAmount.times(2));

        // third call should fail
        openTx.nonce = 3;
        await issueTokensAndSetAllowances(openTx);
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if loan offer canceled', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);
        const dydxMargin = await Margin.deployed();

        await callCancelLoanOffer(
          dydxMargin,
          openTx.loanOffering,
          openTx.loanOffering.rates.maxAmount
        );

        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if buy order canceled', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);
        const exchange = await ZeroExExchangeV1.deployed();

        await callCancelOrder(
          exchange,
          openTx.buyOrder,
          openTx.buyOrder.makerTokenAmount
        );

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if position owner is 0', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);

        const dydxMargin = await Margin.deployed();

        openTx.owner = ADDRESSES.ZERO;

        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if loan owner is 0', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);

        const dydxMargin = await Margin.deployed();

        openTx.loanOffering.owner = ADDRESSES.ZERO;
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails if interest period is over maximum duration', async () => {
        const openTx = await createOpenTx(accounts);

        await issueTokensAndSetAllowances(openTx);

        const dydxMargin = await Margin.deployed();

        openTx.loanOffering.rates.interestPeriod = new BigNumber(
          openTx.loanOffering.maxDuration + 1
        );
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('allows smart contracts to be lenders', async () => {
        const openTx = await createOpenTx(accounts);
        const [
          dydxMargin,
          feeToken,
          owedToken,
          testSmartContractLender
        ] = await Promise.all([
          Margin.deployed(),
          FeeToken.deployed(),
          OwedToken.deployed(),
          TestSmartContractLender.new(false, ADDRESSES.ZERO)
        ]);

        await issueTokensAndSetAllowances(openTx);

        const [
          lenderFeeTokenBalance,
          lenderOwedTokenBalance
        ] = await Promise.all([
          feeToken.balanceOf.call(openTx.loanOffering.payer),
          owedToken.balanceOf.call(openTx.loanOffering.payer)
        ]);
        await Promise.all([
          feeToken.transfer(
            testSmartContractLender.address,
            lenderFeeTokenBalance,
            { from: openTx.loanOffering.payer }
          ),
          owedToken.transfer(
            testSmartContractLender.address,
            lenderOwedTokenBalance,
            { from: openTx.loanOffering.payer }
          )
        ]);
        await Promise.all([
          testSmartContractLender.allow(
            feeToken.address,
            TokenProxy.address,
            lenderFeeTokenBalance
          ),
          testSmartContractLender.allow(
            owedToken.address,
            TokenProxy.address,
            lenderOwedTokenBalance
          )
        ]);

        openTx.loanOffering.payer = testSmartContractLender.address;

        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });
  });

  describe('Balances', () => {
    contract('Margin', accounts => {
      it('fails on insufficient trader balance', async () => {
        const openTx = await createOpenTx(accounts);

        const storedAmount = openTx.depositAmount;
        openTx.depositAmount = openTx.depositAmount.minus(new BigNumber(1));
        await issueTokensAndSetAllowances(openTx);
        openTx.depositAmount = storedAmount;

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient lender balance', async () => {
        const openTx = await createOpenTx(accounts);

        const storedAmount = openTx.loanOffering.rates.maxAmount;
        openTx.loanOffering.rates.maxAmount = openTx.principal.minus(new BigNumber(1));
        await issueTokensAndSetAllowances(openTx);
        openTx.depositAmount = storedAmount;

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient buyer balance', async () => {
        const openTx = await createOpenTx(accounts);

        const storedAmount = openTx.buyOrder.makerTokenAmount;
        openTx.buyOrder.makerTokenAmount = getPartialAmount(
          openTx.buyOrder.makerTokenAmount,
          openTx.buyOrder.takerTokenAmount,
          openTx.principal
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowances(openTx);
        openTx.buyOrder.makerTokenAmount = storedAmount;

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient buyer fee balance', async () => {
        const openTx = await createOpenTx(accounts);

        const storedAmount = openTx.buyOrder.makerFee;
        openTx.buyOrder.makerFee = getPartialAmount(
          openTx.buyOrder.makerFee,
          openTx.buyOrder.takerTokenAmount,
          openTx.principal
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowances(openTx);
        openTx.buyOrder.makerFee = storedAmount;

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient lender fee balance', async () => {
        const openTx = await createOpenTx(accounts);

        const storedAmount = openTx.loanOffering.rates.lenderFee;
        openTx.loanOffering.rates.lenderFee = getPartialAmount(
          openTx.loanOffering.rates.lenderFee,
          openTx.loanOffering.rates.maxAmount,
          openTx.principal
        ).minus(new BigNumber(1));
        await issueTokensAndSetAllowances(openTx);
        openTx.loanOffering.rates.lenderFee = storedAmount;

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('fails on insufficient trader fee balance', async () => {
        const openTx = await createOpenTx(accounts);

        const storedAmount = openTx.loanOffering.rates.takerFee;
        const storedAmount2 = openTx.buyOrder.takerFee;
        openTx.loanOffering.rates.takerFee = getPartialAmount(
          openTx.loanOffering.rates.takerFee,
          openTx.loanOffering.rates.maxAmount,
          openTx.principal
        ).minus(new BigNumber(1));
        openTx.buyOrder.takerFee = getPartialAmount(
          openTx.buyOrder.takerFee,
          openTx.buyOrder.takerTokenAmount,
          openTx.principal
        );
        await issueTokensAndSetAllowances(openTx);
        openTx.loanOffering.rates.takerFee = storedAmount;
        openTx.buyOrder.takerFee = storedAmount2;

        const dydxMargin = await Margin.deployed();
        await expectThrow(callOpenPosition(dydxMargin, openTx));
      });
    });
  });
});

describe('#closePosition', () => {
  describe('Access', () => {
    contract('Margin', accounts => {
      it('Does not allow lender to close', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        openTx.trader = openTx.loanOffering.payer;
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, openTx.principal));
      });
    });

    contract('Margin', accounts => {
      it('Does not allow external address to close', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        openTx.trader = accounts[7];
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, openTx.principal));
      });
    });
  });

  describe('Validations', () => {
    contract('Margin', accounts => {
      it('Enforces that the position exists', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        openTx.id = "0x123";
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, openTx.principal));
      });
    });

    contract('Margin', accounts => {
      it('Only allows position to be entirely closed once', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        // First should succeed
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await callClosePosition(dydxMargin, openTx, sellOrder, openTx.principal);

        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, openTx.principal));
      });
    });

    contract('Margin', accounts => {
      it('Fails if interest fee cannot be paid', async () => {
        const openTx = await createOpenTx(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        // Set the interest fee super high so it can't be paid
        openTx.loanOffering.rates.interestRate = new BigNumber('4000e6');
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

        await issueTokensAndSetAllowances(openTx);
        const tx = await callOpenPosition(dydxMargin, openTx);

        openTx.id = tx.id;
        openTx.response = tx;

        // Wait for interest fee to accrue
        await wait(openTx.loanOffering.maxDuration);

        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, openTx.principal));
      });
    });

    contract('Margin', accounts => {
      it('Fails on invalid order signature', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        sellOrder.ecSignature.r = "0x123";

        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, openTx.principal));
      });
    });

    contract('Margin', accounts => {
      it('Fails if sell order is not large enough', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        sellOrder.makerTokenAmount = openTx.principal.minus(new BigNumber(1));
        sellOrder.ecSignature = await signOrder(sellOrder);

        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow(
          callClosePosition(
            dydxMargin,
            openTx,
            sellOrder,
            openTx.principal
          )
        );
      });
    });

    contract('Margin', accounts => {
      it('Disallows paying out in base token if no exchange wrapper', async() => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        await issueForDirectClose(openTx);
        await expectThrow(
          callClosePosition(
            dydxMargin,
            openTx,
            sellOrder,
            openTx.principal,
            {
              payoutInHeldToken: false,
              exchangeWrapper: ADDRESSES.ZERO
            }
          )
        );
      });
    });

    contract('Margin', accounts => {
      it('Fails if payout recipient is 0', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await expectThrow(
          callClosePosition(
            dydxMargin,
            openTx,
            sellOrder,
            openTx.principal,
            { recipient: ADDRESSES.ZERO }
          )
        );
      });
    });

    contract('Margin', accounts => {
      it('Fails if paying out in owedToken and cannot pay back lender', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        sellOrder.makerTokenAmount = new BigNumber(100000);
        sellOrder.ecSignature = await signOrder(sellOrder);

        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

        await expectThrow(
          callClosePosition(
            dydxMargin,
            openTx,
            sellOrder,
            openTx.principal,
            { payoutInHeldToken: false }
          )
        );
      });
    });
  });

  describe('Balances', () => {
    contract('Margin', accounts => {
      it('Fails on insufficient sell order balance/allowance', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.makerTokenAmount;
        sellOrder.makerTokenAmount = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        sellOrder.makerTokenAmount = amountSave;
        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, openTx.principal));
      });
    });

    contract('Margin', accounts => {
      it('Fails on insufficient sell order fee token balance/allowance', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.makerFee;
        sellOrder.makerFee = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        sellOrder.makerFee = amountSave;
        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, openTx.principal));
      });
    });

    contract('Margin', accounts => {
      it('Fails on insufficient trader fee token balance/allowance', async () => {
        const openTx = await doOpenPosition(accounts);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);

        const amountSave = sellOrder.takerFee;
        sellOrder.takerFee = new BigNumber(0);
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        sellOrder.takerFee = amountSave;
        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, openTx.principal));
      });
    });
  });
});
