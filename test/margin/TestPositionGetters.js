const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const { ADDRESSES, BYTES32 } = require('../helpers/Constants');
const {
  callIncreasePosition,
  createOpenTx,
  doOpenPosition,
  doClosePosition,
  issueTokenToAccountInAmountAndApproveProxy,
  getTokenAmountsFromOpen
} = require('../helpers/MarginHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');
const { getBlockTimestamp } = require("../helpers/NodeHelper");
const { expectWithinError, getPartialAmount } = require("../helpers/MathHelper");
const { wait } = require('@digix/tempo')(web3);

const standardTimeError = 10;

contract('PositionGetters', (accounts) => {

  // ============ Constants ============

  let dydxMargin, heldToken;
  let positionId;
  let openTx;
  let salt = 872354;


  // ============ Helper-Functions ============

  function expectInterest(amount, interestRate, numDays, expected) {
    const exp = Math.exp(interestRate.div("1e8").mul(numDays).div(365));
    expectWithinError(expected, amount.mul(exp.toString()), 100);
  }

  async function getGetters(positionId, throws = false) {
    const nowTimestamp = await getBlockTimestamp(openTx.response.receipt.blockNumber);
    const futureTimestamp = nowTimestamp + (60*60*24*5);
    const halfPrincipal = openTx.principal.div(2).floor();
    const [
      [addresses, values256, values32],
      lender,
      owner,
      heldToken,
      owedToken,
      principal,
      interestRate,
      requiredDeposit,
      startTimestamp,
      callTimestamp,
      callTimeLimit,
      maxDuration,
      interestPeriod,
      contains,
      isCalled,
      isClosed,
      balance,
      totalRepaid
    ] = await Promise.all([
      dydxMargin.getPosition.call(positionId),
      dydxMargin.getPositionLender.call(positionId),
      dydxMargin.getPositionOwner.call(positionId),
      dydxMargin.getPositionHeldToken.call(positionId),
      dydxMargin.getPositionOwedToken.call(positionId),
      dydxMargin.getPositionPrincipal.call(positionId),
      dydxMargin.getPositionInterestRate.call(positionId),
      dydxMargin.getPositionRequiredDeposit.call(positionId),
      dydxMargin.getPositionStartTimestamp.call(positionId),
      dydxMargin.getPositionCallTimestamp.call(positionId),
      dydxMargin.getPositionCallTimeLimit.call(positionId),
      dydxMargin.getPositionMaxDuration.call(positionId),
      dydxMargin.getPositioninterestPeriod.call(positionId),
      dydxMargin.containsPosition.call(positionId),
      dydxMargin.isPositionCalled.call(positionId),
      dydxMargin.isPositionClosed.call(positionId),
      dydxMargin.getPositionBalance.call(positionId),
      dydxMargin.getTotalOwedTokenRepaidToLender.call(positionId)
    ]);

    let [
      timeUntilIncrease,
      owedAmount,
      owedAmountAtTime,
      amountForIncreaseAtTime,
    ] = ["THREW", "THREW", "THREW", "THREW"];
    if (!throws) {
      [
        timeUntilIncrease,
        owedAmount,
        owedAmountAtTime,
        amountForIncreaseAtTime,
      ] = await Promise.all([
        dydxMargin.getTimeUntilInterestIncrease.call(positionId),
        dydxMargin.getPositionOwedAmount.call(positionId),
        dydxMargin.getPositionOwedAmountAtTime.call(
          positionId, halfPrincipal, futureTimestamp),
        dydxMargin.getLenderAmountForIncreasePositionAtTime.call(
          positionId, halfPrincipal, futureTimestamp)
      ]);
    } else {
      await expectThrow(
        dydxMargin.getTimeUntilInterestIncrease.call(positionId)
      );
      await expectThrow(
        dydxMargin.getPositionOwedAmount.call(positionId)
      );
      await expectThrow(
        dydxMargin.getPositionOwedAmountAtTime.call(
          positionId, halfPrincipal, futureTimestamp)
      );
      await expectThrow(
        dydxMargin.getLenderAmountForIncreasePositionAtTime.call(
          positionId, halfPrincipal, futureTimestamp)
      );
    }

    expect(addresses[0]).to.equal(owedToken);
    expect(addresses[1]).to.equal(heldToken);
    expect(addresses[2]).to.equal(lender);
    expect(addresses[3]).to.equal(owner);
    expect(values256[0]).to.be.bignumber.equal(principal);
    expect(values256[1]).to.be.bignumber.equal(requiredDeposit);
    expect(values32[0]).to.be.bignumber.equal(callTimeLimit);
    expect(values32[1]).to.be.bignumber.equal(startTimestamp);
    expect(values32[2]).to.be.bignumber.equal(callTimestamp);
    expect(values32[3]).to.be.bignumber.equal(maxDuration);
    expect(values32[4]).to.be.bignumber.equal(interestRate);
    expect(values32[5]).to.be.bignumber.equal(interestPeriod);

    return {
      lender,
      owner,
      heldToken,
      owedToken,
      principal,
      interestRate,
      requiredDeposit,
      startTimestamp,
      callTimestamp,
      callTimeLimit,
      maxDuration,
      interestPeriod,
      contains,
      isCalled,
      isClosed,
      balance,
      timeUntilIncrease,
      owedAmount,
      owedAmountAtTime,
      amountForIncreaseAtTime,
      totalRepaid
    }
  }

  // ============ Before ============

  before('get global contracts', async () => {
    [
      dydxMargin,
      heldToken
    ] = await Promise.all([
      Margin.deployed(),
      HeldToken.deployed()
    ]);
  });

  beforeEach('create position', async () => {
    openTx = await doOpenPosition(accounts, { salt: salt++ });
    positionId = openTx.id;
  });

  // ============ Tests ============

  describe('basic getters', () => {

    it('check values for non-existent position', async () => {
      const position = await getGetters(BYTES32.TEST[0], true);
      expect(position.lender).to.equal(ADDRESSES.ZERO);
      expect(position.owner).to.equal(ADDRESSES.ZERO);
      expect(position.heldToken).to.equal(ADDRESSES.ZERO);
      expect(position.owedToken).to.equal(ADDRESSES.ZERO);
      expect(position.principal).to.be.bignumber.equal(0);
      expect(position.interestRate).to.be.bignumber.equal(0);
      expect(position.requiredDeposit).to.be.bignumber.equal(0);
      expect(position.startTimestamp).to.be.bignumber.equal(0);
      expect(position.callTimestamp).to.be.bignumber.equal(0);
      expect(position.callTimeLimit).to.be.bignumber.equal(0);
      expect(position.maxDuration).to.be.bignumber.equal(0);
      expect(position.interestPeriod).to.be.bignumber.equal(0);
      expect(position.contains).to.be.false;
      expect(position.isCalled).to.be.false;
      expect(position.isClosed).to.be.false;
      expect(position.balance).to.be.bignumber.equal(0);
      expect(position.totalRepaid).to.be.bignumber.equal(0);
    });

    it('check values for newly opened position', async () => {
      await wait(1);
      const position = await getGetters(positionId);
      expect(position.lender).to.equal(openTx.loanOffering.owner);
      expect(position.owner).to.equal(openTx.owner);
      expect(position.heldToken).to.equal(openTx.loanOffering.heldToken);
      expect(position.owedToken).to.equal(openTx.loanOffering.owedToken);
      expect(position.principal).to.be.bignumber.equal(openTx.principal);
      expect(position.interestRate).to.be.bignumber.equal(openTx.loanOffering.rates.interestRate);
      expect(position.requiredDeposit).to.be.bignumber.equal(0);
      const startTimestamp = await getBlockTimestamp(openTx.response.receipt.blockNumber);
      expect(position.startTimestamp).to.be.bignumber.equal(startTimestamp);
      expect(position.callTimestamp).to.be.bignumber.equal(0);
      expect(position.callTimeLimit).to.be.bignumber.equal(openTx.loanOffering.callTimeLimit);
      expect(position.maxDuration).to.be.bignumber.equal(openTx.loanOffering.maxDuration);
      expect(position.interestPeriod).to.be.bignumber.equal(
        openTx.loanOffering.rates.interestPeriod);
      expect(position.contains).to.be.true;
      expect(position.isCalled).to.be.false;
      expect(position.isClosed).to.be.false;
      expect(position.totalRepaid).to.be.bignumber.equal(0);

      const { expectedHeldTokenBalance } = getTokenAmountsFromOpen(openTx);
      expect(position.balance).to.be.bignumber.equal(expectedHeldTokenBalance);
      expectWithinError(position.timeUntilIncrease, 86400, standardTimeError);
      expectInterest(openTx.principal, position.interestRate, 1, position.owedAmount);

      const halfPrincipal = openTx.principal.div(2).floor();
      expectInterest(halfPrincipal, position.interestRate, 5, position.owedAmountAtTime);
      expectInterest(halfPrincipal, position.interestRate, 5, position.amountForIncreaseAtTime);
    });

    it('check values for closed position', async () => {
      await wait(1);
      await doClosePosition(
        accounts,
        openTx,
        openTx.principal
      );
      const position = await getGetters(positionId, true);
      expect(position.lender).to.equal(ADDRESSES.ZERO);
      expect(position.owner).to.equal(ADDRESSES.ZERO);
      expect(position.heldToken).to.equal(ADDRESSES.ZERO);
      expect(position.owedToken).to.equal(ADDRESSES.ZERO);
      expect(position.principal).to.be.bignumber.equal(0);
      expect(position.interestRate).to.be.bignumber.equal(0);
      expect(position.requiredDeposit).to.be.bignumber.equal(0);
      expect(position.startTimestamp).to.be.bignumber.equal(0);
      expect(position.callTimestamp).to.be.bignumber.equal(0);
      expect(position.callTimeLimit).to.be.bignumber.equal(0);
      expect(position.maxDuration).to.be.bignumber.equal(0);
      expect(position.interestPeriod).to.be.bignumber.equal(0);
      expect(position.contains).to.be.false;
      expect(position.isCalled).to.be.false;
      expect(position.isClosed).to.be.true;
      expect(position.balance).to.be.bignumber.equal(0);
      expectInterest(
        openTx.principal, openTx.loanOffering.rates.interestRate, 1, position.totalRepaid
      );
    });
  });

  describe('#getPositionLender and #getPositionOwner', () => {
    it('check values for lender and owner', async () => {
      const newOwner = ADDRESSES.TEST[1];
      const newLender = ADDRESSES.TEST[2];
      await dydxMargin.transferPosition(openTx.id, newOwner, { from: openTx.owner});
      await dydxMargin.transferLoan(openTx.id, newLender, { from: openTx.loanOffering.owner});
      const position = await getGetters(positionId);
      expect(position.lender).to.equal(newLender);
      expect(position.owner).to.equal(newOwner);
    });
  });

  describe('#getPositionPrincipal and #getPositionBalance', () => {
    it('check values for principal and balance', async () => {
      const [principal0, balance0] = await Promise.all([
        dydxMargin.getPositionPrincipal.call(BYTES32.BAD_ID),
        dydxMargin.getPositionBalance.call(BYTES32.BAD_ID),
      ]);
      expect(principal0).to.be.bignumber.equal(0);
      expect(balance0).to.be.bignumber.equal(0);

      const { expectedHeldTokenBalance } = getTokenAmountsFromOpen(openTx);
      const [principal1, balance1] = await Promise.all([
        dydxMargin.getPositionPrincipal.call(positionId),
        dydxMargin.getPositionBalance.call(positionId),
      ]);
      expect(principal1).to.be.bignumber.equal(openTx.principal);
      expect(balance1).to.be.bignumber.equal(expectedHeldTokenBalance);

      const closeAmount = openTx.principal.div(2).floor();
      await doClosePosition(
        accounts,
        openTx,
        closeAmount
      );

      const principal2 = await dydxMargin.getPositionPrincipal.call(positionId);
      const balance2 = await dydxMargin.getPositionBalance.call(positionId);
      expect(principal2).to.be.bignumber.equal(principal1.minus(closeAmount));
      const expectedHeldTokenBalance2 = getPartialAmount(expectedHeldTokenBalance, 2, 1, true);
      expect(balance2).to.be.bignumber.equal(expectedHeldTokenBalance2);

      const increasePosTx = await createOpenTx(accounts, { salt: salt++ });
      increasePosTx.id = openTx.id;
      increasePosTx.loanOffering.rates.minHeldToken = new BigNumber(0);
      increasePosTx.loanOffering.signature = await signLoanOffering(increasePosTx.loanOffering);
      await issueTokenToAccountInAmountAndApproveProxy(
        heldToken,
        increasePosTx.trader,
        increasePosTx.depositAmount.times(4)
      );
      await callIncreasePosition(dydxMargin, increasePosTx);

      const principal3 = await dydxMargin.getPositionPrincipal.call(positionId);
      const balance3 = await dydxMargin.getPositionBalance.call(positionId);
      expect(principal3).to.be.bignumber.equal(openTx.principal.times(3).div(2));
      const expectedHeldTokenBalance3 = getPartialAmount(expectedHeldTokenBalance2, 1, 3, true);
      expect(balance3).to.be.bignumber.equal(expectedHeldTokenBalance3);
    });
  });

  describe('#isPositionCalled, #getPositionCallTimestamp, and #getPositionRequiredDeposit', () => {
    it('check values for isCalled and callTimestamp and requiredDeposit', async () => {
      const before = await getGetters(positionId);
      expect(before.isCalled).to.be.false;
      expect(before.callTimestamp).to.be.bignumber.equal(0);
      expect(before.requiredDeposit).to.be.bignumber.equal(0);

      const depositAmount = new BigNumber(12345);
      const marginCallTx = await dydxMargin.marginCall(
        positionId,
        depositAmount,
        { from: openTx.loanOffering.owner }
      );
      const callTimestamp = await getBlockTimestamp(marginCallTx.receipt.blockNumber);

      const after = await getGetters(positionId);
      expect(after.isCalled).to.be.true;
      expect(after.callTimestamp).to.be.bignumber.equal(callTimestamp);
      expect(after.requiredDeposit).to.be.bignumber.equal(depositAmount);

      await dydxMargin.cancelMarginCall(
        positionId,
        { from: openTx.loanOffering.owner }
      );

      const final = await getGetters(positionId);
      expect(final.isCalled).to.be.false;
      expect(final.callTimestamp).to.be.bignumber.equal(0);
      expect(final.requiredDeposit).to.be.bignumber.equal(0);
    });
  });

  describe('#getTimeUntilInterestIncrease', () => {
    it('check values for timeUntilIncrease', async () => {
      const position = await getGetters(positionId);
      const oneHour = 60 * 60;
      const oneDay = oneHour * 24;
      expect(position.interestPeriod).to.be.bignumber.equal(oneDay);

      await wait(1);
      const t1 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expectWithinError(t1, oneDay, standardTimeError);

      await wait(oneDay);
      const t2 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expectWithinError(t2, t1, standardTimeError);

      await wait(oneHour);
      const t3 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expectWithinError(t3, t2 - oneHour, standardTimeError);

      await wait(oneHour);
      const t4 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expectWithinError(t4, t3 - oneHour, standardTimeError);

      await wait(oneDay);
      const t5 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expectWithinError(t5, t4, standardTimeError);

      // test after maxDuration has passed
      await wait(openTx.loanOffering.maxDuration);
      const t6 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expect(t6).to.be.bignumber.equal(0);
    });
  });

  describe('#getPositionOwedAmount', () => {
    it('check values for owedAmount', async () => {
      const position = await getGetters(positionId);
      const oneHour = 60 * 60;
      const oneDay = oneHour * 24;
      expect(position.interestPeriod).to.be.bignumber.equal(oneDay);

      // ensure no interest works
      /*
      // Unable to test without time increasing
      const owedAmount1 = await dydxMargin.getPositionOwedAmount.call(positionId);
      expect(owedAmount1).to.be.bignumber.equal(openTx.principal);
      */

      // ensure interest accrued works
      await wait(oneDay / 2);
      const owedAmount2 = await dydxMargin.getPositionOwedAmount.call(positionId);
      expectInterest(openTx.principal, position.interestRate, 1, owedAmount2);

      // ensure interest accrued works again
      await wait(oneDay * 49);
      const owedAmount3 = await dydxMargin.getPositionOwedAmount.call(positionId);
      const exp2 = Math.exp(position.interestRate.div("1e8").mul(50).div(365));
      expectWithinError(owedAmount3, openTx.principal.mul(exp2.toString()), 100);
    });
  });

  describe('#getPositionOwedAmountAtTime', () => {
    it('check values for owedAmountAtTime', async () => {
      const position = await getGetters(positionId);
      const oneHour = 60 * 60;
      const oneDay = oneHour * 24;
      expect(position.interestPeriod).to.be.bignumber.equal(oneDay);
      const futureTime = position.startTimestamp.plus(oneDay * 50);

      // ensure negative time doesn't work
      await expectThrow(
        dydxMargin.getPositionOwedAmountAtTime.call(
          positionId,
          openTx.principal,
          position.startTimestamp.minus(oneDay)
        )
      );

      // ensure no interest works
      const owedAmount1 = await dydxMargin.getPositionOwedAmountAtTime.call(
        positionId,
        openTx.principal,
        position.startTimestamp
      );
      expect(owedAmount1).to.be.bignumber.equal(openTx.principal);

      // ensure interest accrued works
      const owedAmount2 = await dydxMargin.getPositionOwedAmountAtTime.call(
        positionId,
        openTx.principal,
        futureTime
      );
      const exp = Math.exp(position.interestRate.div("1e8").mul(50).div(365));
      expectWithinError(owedAmount2, openTx.principal.mul(exp.toString()), 100);

      // ensure different principal amount work
      const owedAmount3 = await dydxMargin.getPositionOwedAmountAtTime.call(
        positionId,
        openTx.principal.div(2),
        futureTime
      );
      expectWithinError(owedAmount3, owedAmount2.div(2), 1);

      // ensure different principal amount work (too much principal)
      const owedAmount4 = await dydxMargin.getPositionOwedAmountAtTime.call(
        positionId,
        openTx.principal.mul(2),
        futureTime
      );
      expectWithinError(owedAmount4, owedAmount2.mul(2), 1);
    });
  });

  describe('#getLenderAmountForIncreasePositionAtTime', () => {
    it('check values for amountForIncreaseAtTime', async () => {
      const position = await getGetters(positionId);
      const oneHour = 60 * 60;
      const oneDay = oneHour * 24;
      expect(position.interestPeriod).to.be.bignumber.equal(oneDay);
      const futureTime = position.startTimestamp.plus(oneDay * 50);

      // ensure negative time doesn't work
      await expectThrow(
        dydxMargin.getLenderAmountForIncreasePositionAtTime.call(
          positionId,
          openTx.principal,
          position.startTimestamp.minus(oneDay)
        )
      );

      // ensure no interest works
      const owedAmount1 = await dydxMargin.getLenderAmountForIncreasePositionAtTime.call(
        positionId,
        openTx.principal,
        position.startTimestamp.plus(2) // ensure it rounds down to startTimestamp
      );
      expect(owedAmount1).to.be.bignumber.equal(openTx.principal);

      // ensure interest accrued works
      const owedAmount2 = await dydxMargin.getLenderAmountForIncreasePositionAtTime.call(
        positionId,
        openTx.principal,
        futureTime
      );
      expectInterest(openTx.principal, position.interestRate, 50, owedAmount2);

      // ensure different principal amount work
      const owedAmount3 = await dydxMargin.getLenderAmountForIncreasePositionAtTime.call(
        positionId,
        openTx.principal.div(2),
        futureTime
      );
      expectWithinError(owedAmount3, owedAmount2.div(2), 1);

      // ensure different principal amount work (more than original)
      const owedAmount4 = await dydxMargin.getLenderAmountForIncreasePositionAtTime.call(
        positionId,
        openTx.principal.mul(2),
        futureTime
      );
      expectWithinError(owedAmount4, owedAmount2.mul(2), 1);
    });

    it('works for interestPeriod of 1 or 0 ', async () => {
      const onePeriodOpenTx = await doOpenPosition(
        accounts,
        {
          salt: ++salt,
          interestPeriod: 1
        }
      );
      const zeroPeriodOpenTx = await doOpenPosition(
        accounts,
        {
          salt: ++salt,
          interestPeriod: new BigNumber(0)
        }
      );

      const [position0, position1] = await Promise.all([
        getGetters(zeroPeriodOpenTx.id),
        getGetters(onePeriodOpenTx.id)
      ]);

      const [amount0, amount1] = await Promise.all([
        dydxMargin.getLenderAmountForIncreasePositionAtTime.call(
          zeroPeriodOpenTx.id,
          zeroPeriodOpenTx.principal,
          position0.startTimestamp
        ),
        dydxMargin.getLenderAmountForIncreasePositionAtTime.call(
          onePeriodOpenTx.id,
          onePeriodOpenTx.principal,
          position1.startTimestamp
        ),
      ]);
      expect(amount0).to.be.bignumber.equal(zeroPeriodOpenTx.principal);
      expect(amount1).to.be.bignumber.equal(onePeriodOpenTx.principal);

    });
  });

  describe('#getTotalOwedTokenRepaidToLender', () => {
    it('check values for totalRepaid', async () => {
      const oneHour = 60 * 60;
      const oneDay = oneHour * 24;
      await wait(oneDay * 4.5);

      const closeAmount1 = openTx.principal.div(2).floor();
      await doClosePosition(
        accounts,
        openTx,
        closeAmount1
      );

      const position1 = await getGetters(positionId);
      expectInterest(closeAmount1, position1.interestRate, 5, position1.totalRepaid);

      const closeAmount2 = openTx.principal.minus(closeAmount1);
      await doClosePosition(
        accounts,
        openTx,
        closeAmount2
      );

      const position2 = await getGetters(positionId, true);
      expectInterest(openTx.principal, position1.interestRate, 5, position2.totalRepaid);
    });
  });

  describe('#getTimeUntilInterestIncrease', () => {
    it('works with an interestPeriod of 0 or 1', async () => {
      // Cannot currently open positions in parallel
      const onePeriodOpenTx = await doOpenPosition(
        accounts,
        {
          salt: ++salt,
          interestPeriod: 1
        }
      );
      const zeroPeriodOpenTx = await doOpenPosition(
        accounts,
        {
          salt: ++salt,
          interestPeriod: new BigNumber(0)
        }
      );

      const [timeUntilOneIncrease, timeUntilZeroIncrease] = await Promise.all([
        dydxMargin.getTimeUntilInterestIncrease.call(onePeriodOpenTx.id),
        dydxMargin.getTimeUntilInterestIncrease.call(zeroPeriodOpenTx.id),
      ]);

      expect(timeUntilOneIncrease).to.be.bignumber.eq(1);
      expect(timeUntilZeroIncrease).to.be.bignumber.eq(1);
    });
  });
});
