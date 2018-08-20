const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const OpenDirectlyExchangeWrapper = artifacts.require("OpenDirectlyExchangeWrapper");
const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");

const { signLoanOffering } = require('../../../../helpers/LoanHelper');
const { ADDRESSES, BYTES, ORDER_TYPE } = require('../../../../helpers/Constants');
const { getPartialAmount } = require('../../../../helpers/MathHelper');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const {
  createOpenTx,
  callOpenPosition,
  issueTokenToAccountInAmountAndApproveProxy
} = require('../../../../helpers/MarginHelper');

describe('OpenDirectlyExchangeWrapper', () => {
  describe('#getExchangeCost', () => {
    contract('OpenDirectlyExchangeWrapper', accounts => {
      it('gives the correct maker token for a given order', async () => {
        const exchangeWrapper = await setup(accounts);

        await expectThrow(
          exchangeWrapper.getExchangeCost.call(
            ADDRESSES.TEST[0],
            ADDRESSES.TEST[1],
            1,
            BYTES.EMPTY
          )
        );

        const requiredTakerTokenAmount = await exchangeWrapper.getExchangeCost.call(
          ADDRESSES.TEST[0],
          ADDRESSES.TEST[1],
          0,
          BYTES.EMPTY
        );

        expect(requiredTakerTokenAmount).to.be.bignumber.eq(0);
      });
    });
  });

  describe('#exchange', () => {
    contract('OpenDirectlyExchangeWrapper', accounts => {
      let dydxMargin, owedToken, heldToken, exchangeWrapper;

      before('set up contracts', async () => {
        [
          dydxMargin,
          owedToken,
          heldToken,
          exchangeWrapper
        ] = await Promise.all([
          Margin.deployed(),
          OwedToken.deployed(),
          HeldToken.deployed(),
          OpenDirectlyExchangeWrapper.deployed()
        ]);
      });

      it('successfully executes a trade', async () => {
        const openTx = await createOpenTx(accounts);
        openTx.loanOffering.rates.lenderFee = new BigNumber(0);
        openTx.loanOffering.rates.takerFee = new BigNumber(0);
        openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
        openTx.buyOrder = { type: ORDER_TYPE.DIRECT };
        openTx.exchangeWrapper = exchangeWrapper.address;
        openTx.depositAmount = getPartialAmount(
          openTx.principal,
          openTx.loanOffering.rates.maxAmount,
          openTx.loanOffering.rates.minHeldToken,
          true
        );
        await issueTokenToAccountInAmountAndApproveProxy(
          heldToken,
          openTx.trader,
          openTx.depositAmount
        );
        await issueTokenToAccountInAmountAndApproveProxy(
          owedToken,
          openTx.loanOffering.payer,
          openTx.principal
        );

        const [
          payerOwed0,
          traderOwed0,
          traderHeld0
        ] = await Promise.all([
          owedToken.balanceOf.call(openTx.loanOffering.payer),
          owedToken.balanceOf.call(openTx.trader),
          heldToken.balanceOf.call(openTx.trader)
        ]);

        const response = await callOpenPosition(dydxMargin, openTx);

        const [
          payerOwed1,
          traderOwed1,
          traderHeld1,
          positionBalance,
          positionPrincipal
        ] = await Promise.all([
          owedToken.balanceOf.call(openTx.loanOffering.payer),
          owedToken.balanceOf.call(openTx.trader),
          heldToken.balanceOf.call(openTx.trader),
          dydxMargin.getPositionBalance.call(response.id),
          dydxMargin.getPositionPrincipal.call(response.id)
        ]);

        expect(payerOwed0.minus(payerOwed1)).to.be.bignumber.eq(openTx.principal);
        expect(traderOwed1.minus(traderOwed0)).to.be.bignumber.eq(openTx.principal);
        expect(traderHeld0.minus(traderHeld1)).to.be.bignumber.eq(openTx.depositAmount);
        expect(positionBalance).to.be.bignumber.eq(openTx.depositAmount);
        expect(positionPrincipal).to.be.bignumber.eq(openTx.principal);
      });

      it('fails if it doesnt have enough tokens', async () => {
        await expectThrow(
          exchangeWrapper.exchange(
            accounts[0],
            accounts[0],
            heldToken.address,
            owedToken.address,
            1000,
            BYTES.EMPTY,
          )
        );
      });
    });
  });
});

async function setup(accounts) {
  const exchangeWrapper = await OpenDirectlyExchangeWrapper.new(
    accounts[0],
    accounts[1],
  );
  return exchangeWrapper;
}
