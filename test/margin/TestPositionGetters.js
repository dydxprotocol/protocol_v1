/*global web3, artifacts, contract, describe, before, beforeEach, it*/

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

contract('PositionGetters', (accounts) => {

  // ============ Constants ============

  let dydxMargin, heldToken;
  let positionId;
  let openTx;
  let salt = 872354;

  const interestAfterOneDay =    "1000100005000166671"; // 1e18 * e^(0.0001) rounded-up
  const interestAfterFiveDays =  "1000500125020835938"; // 1e18 * e^(0.0005) rounded-up
  const interestAfterFiftyDays = "1005012520859401064"; // 1e18 * e^(0.005) rounded-up

  // ============ Helper Functions ============

  async function getGetters(positionId, throws = false) {
    const nowTimestamp = await getBlockTimestamp(openTx.response.receipt.blockNumber);
    const futureTimestamp = nowTimestamp + (60*60*24*5);
    const halfPrincipal = openTx.principal.div(2);
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
    openTx = await doOpenPosition(accounts, salt++);
    positionId = openTx.id;
  });

  // ============ Tests ============

  describe('#function', function() {

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
      expectWithinError(position.timeUntilIncrease, 86400, 1);
      expect(position.owedAmount).to.be.bignumber.equal(interestAfterOneDay);

      const halfPInterestAfterFiveDays = new BigNumber(interestAfterFiveDays).div(2);
      expect(position.owedAmountAtTime).to.be.bignumber.equal(halfPInterestAfterFiveDays)
      expect(position.amountForIncreaseAtTime).to.be.bignumber.equal(halfPInterestAfterFiveDays);
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
      expect(position.totalRepaid).to.be.bignumber.gte(interestAfterOneDay);
    });

    it('check values for lender and owner', async () => {
      const newOwner = ADDRESSES.TEST[1];
      const newLender = ADDRESSES.TEST[2];
      await dydxMargin.transferPosition(openTx.id, newOwner, { from: openTx.owner});
      await dydxMargin.transferLoan(openTx.id, newLender, { from: openTx.loanOffering.owner});
      const position = await getGetters(positionId);
      expect(position.lender).to.equal(newLender);
      expect(position.owner).to.equal(newOwner);
    });

    it('check values for principal and balance', async () => {
      const { expectedHeldTokenBalance } = getTokenAmountsFromOpen(openTx);
      const principal1 = await dydxMargin.getPositionPrincipal.call(positionId);
      const balance1 = await dydxMargin.getPositionBalance.call(positionId);
      expect(principal1).to.be.bignumber.equal(openTx.principal);
      expect(balance1).to.be.bignumber.equal(expectedHeldTokenBalance);

      await doClosePosition(
        accounts,
        openTx,
        openTx.principal.div(2)
      );

      const principal2 = await dydxMargin.getPositionPrincipal.call(positionId);
      const balance2 = await dydxMargin.getPositionBalance.call(positionId);
      expect(principal2).to.be.bignumber.equal(openTx.principal.div(2));
      const expectedHeldTokenBalance2 = getPartialAmount(expectedHeldTokenBalance, 2, 1, true);
      expect(balance2).to.be.bignumber.equal(expectedHeldTokenBalance2);

      const increasePosTx = await createOpenTx(accounts, salt++);
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

    it('check values for timeUntilIncrease', async () => {
      const position = await getGetters(positionId);
      const oneHour = 60 * 60;
      const oneDay = oneHour * 24;
      expect(position.interestPeriod).to.be.bignumber.equal(oneDay);

      await wait(1);
      const t1 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expectWithinError(t1, oneDay, 1);

      await wait(oneDay);
      const t2 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expectWithinError(t2, t1, 1);

      await wait(oneHour);
      const t3 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expectWithinError(t3, t2 - oneHour, 1);

      await wait(oneHour);
      const t4 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expectWithinError(t4, t3 - oneHour, 1);

      await wait(oneDay);
      const t5 = await dydxMargin.getTimeUntilInterestIncrease.call(positionId);
      expectWithinError(t5, t4, 1);
    });

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
      expectWithinError(owedAmount2, interestAfterOneDay, 100);

      // ensure interest accrued works again
      await wait(oneDay * 49);
      const owedAmount3 = await dydxMargin.getPositionOwedAmount.call(positionId);
      const exp2 = Math.exp(position.interestRate.div("1e8").mul(50).div(365));
      expectWithinError(owedAmount3, openTx.principal.mul(exp2.toString()), 100);
    });

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
      expectWithinError(owedAmount2, interestAfterFiftyDays, 100);

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

    it('check values for totalRepaid', async () => {
      const oneHour = 60 * 60;
      const oneDay = oneHour * 24;
      await wait(oneDay * 4.5);

      await doClosePosition(
        accounts,
        openTx,
        openTx.principal.div(2)
      );

      const position1 = await getGetters(positionId);
      expect(position1.totalRepaid).to.be.bignumber.equal(
        new BigNumber(interestAfterFiveDays).div(2)
      );

      await doClosePosition(
        accounts,
        openTx,
        openTx.principal.div(2)
      );

      const position2 = await getGetters(positionId, true);
      expect(position2.totalRepaid).to.be.bignumber.equal(
        new BigNumber(interestAfterFiveDays)
      );
    });
  });
});
