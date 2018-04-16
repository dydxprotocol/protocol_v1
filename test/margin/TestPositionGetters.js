/*global artifacts, contract, describe, before, beforeEach, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
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
const { getBlockTimestamp } = require("../helpers/NodeHelper");

contract('PositionGetters', (accounts) => {

  // ============ Constants ============

  let dydxMargin;
  let heldToken, owedToken;
  let positionId;
  let openTx;
  let salt = 872354;

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
    }
  }

  // ============ Before ============

  before('get global contracts', async () => {
    [
      dydxMargin,
      heldToken,
      owedToken
    ] = await Promise.all([
      Margin.deployed(),
      HeldToken.deployed(),
      OwedToken.deployed()
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
    });

    it('check values for newly opened position', async () => {
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

      const { expectedHeldTokenBalance } = getTokenAmountsFromOpen(openTx);
      expect(position.balance).to.be.bignumber.equal(expectedHeldTokenBalance);
      //TODO
      /*
      expect(position.timeUntilIncrease).to.be.bignumber.equal();
      expect(position.owedAmount).to.be.bignumber.equal();
      expect(position.owedAmountAtTime).to.be.bignumber.equal();
      expect(position.amountForIncreaseAtTime).to.be.bignumber.equal();
      */
    });

    it('check values for closed position', async () => {
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
      const principal1 = await dydxMargin.getPositionPrincipal(positionId);
      const balance1 = await dydxMargin.getPositionBalance(expectedHeldTokenBalance);
      expect(principal1).to.be.bignumber.equal(openTx.principal);
      expect(balance1).to.be.bignumber.equal(expectedHeldTokenBalance);

      await doClosePosition(
        accounts,
        openTx,
        openTx.principal.div(2)
      );

      const principal2 = await dydxMargin.getPositionPrincipal(positionId);
      const balance2 = await dydxMargin.getPositionBalance(expectedHeldTokenBalance);
      expect(principal2).to.be.bignumber.equal(openTx.principal.div(2));
      expect(balance2).to.be.bignumber.equal(expectedHeldTokenBalance.div(2));

      const increasePosTx = await createOpenTx(accounts, salt++);
      increasePosTx.id = openTx.id;
      await issueTokenToAccountInAmountAndApproveProxy(
        heldToken,
        increasePosTx.trader,
        increasePosTx.depositAmount
      );
      await callIncreasePosition(dydxMargin, increasePosTx);

      const principal3 = await dydxMargin.getPositionPrincipal(positionId);
      const balance3 = await dydxMargin.getPositionBalance(expectedHeldTokenBalance);
      expect(principal3).to.be.bignumber.equal(openTx.principal.times(3).div(2));
      expect(balance3).to.be.bignumber.equal(expectedHeldTokenBalance.times(3).div(2));
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
      //TODO
    });

    it('check values for owedAmount', async () => {
      //TODO
    });

    it('check values for owedAmountAtTime', async () => {
      //TODO
    });

    it('check values for amountForIncreaseAtTime', async () => {
      //TODO
    });
  });
});
