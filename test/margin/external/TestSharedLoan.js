/*global artifacts, web3, contract, describe, it, before, beforeEach*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const SharedLoan = artifacts.require("SharedLoan");
const Margin = artifacts.require("Margin");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ProxyContract = artifacts.require("Proxy");

const { transact } = require('../../helpers/ContractHelper');
const { ADDRESSES, BIGNUMBERS, BYTES32 } = require('../../helpers/Constants');
const { expectAssertFailure, expectThrow } = require('../../helpers/ExpectHelper');
const { getSharedLoanConstants, SHARED_LOAN_STATE } = require('./SharedLoanHelper');
const { getPartialAmount } = require('../../helpers/MathHelper');
const { createSignedSellOrder } = require('../../helpers/0xHelper');
const { signLoanOffering } = require('../../helpers/LoanHelper');
const {
  issueTokenToAccountInAmountAndApproveProxy,
  callOpenPosition,
  doOpenPosition,
  createOpenTx,
  issueTokensAndSetAllowances,
  callIncreasePosition,
  issueTokensAndSetAllowancesForClose,
  callClosePosition,
  getPosition
} = require('../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

contract('SharedLoan', function(accounts) {

  // ============ Constants ============

  let dydxMargin;
  let owedToken, heldToken;
  let salt = 987654;
  let SHARED_LOAN = {
    CONTRACT: null,
    ID: null,
    TX: null,
    NUM_TOKENS: null,
    TRUSTED_MARGIN_CALLERS: null,
    INITIAL_LENDER: null,
    POSITION_OWNER: null
  }

  // ============ Helper Functions ============

  async function setUpPosition() {
    const openTx = await doOpenPosition(accounts, salt++);
    SHARED_LOAN.ID = openTx.id;
    SHARED_LOAN.TX = openTx;
    SHARED_LOAN.INITIAL_LENDER = accounts[9];
    SHARED_LOAN.POSITION_OWNER = openTx.owner;
  }

  async function setUpSharedLoan() {
    SHARED_LOAN.TRUSTED_MARGIN_CALLERS = [accounts[8], ADDRESSES.TEST[2]];
    SHARED_LOAN.CONTRACT = await SharedLoan.new(
      SHARED_LOAN.ID,
      dydxMargin.address,
      SHARED_LOAN.INITIAL_LENDER,
      SHARED_LOAN.TRUSTED_MARGIN_CALLERS
    );
  }

  async function transferLoanToSharedLoan() {
    await dydxMargin.transferLoan(
      SHARED_LOAN.ID,
      SHARED_LOAN.CONTRACT.address,
      { from: SHARED_LOAN.TX.loanOffering.owner }
    );
  }

  async function transferPositionToTestPositionOwner() {
    const positionOwner = await TestPositionOwner.new(
      dydxMargin.address,
      ADDRESSES.ONE,
      true
    );
    await dydxMargin.transferPosition(
      SHARED_LOAN.ID,
      positionOwner.address,
      { from: SHARED_LOAN.TX.owner }
    );
    SHARED_LOAN.POSITION_OWNER = positionOwner.address;
  }

  async function increasePositionDirectly(adder, addedPrincipal) {
    const [principal, amountHeld] = await Promise.all([
      dydxMargin.getPositionPrincipal(SHARED_LOAN.ID),
      dydxMargin.getPositionBalance(SHARED_LOAN.ID),
    ]);
    const heldTokenAmount = getPartialAmount(
      addedPrincipal,
      principal,
      amountHeld,
      true
    );
    await issueTokenToAccountInAmountAndApproveProxy(heldToken, adder, heldTokenAmount);
    await dydxMargin.increasePositionDirectly(
      SHARED_LOAN.ID,
      addedPrincipal,
      { from: adder }
    );
  }

  // ============ Before ============

  before('Set up Proxy, Margin accounts', async () => {
    [
      dydxMargin,
      owedToken,
      heldToken
    ] = await Promise.all([
      Margin.deployed(),
      OwedToken.deployed(),
      HeldToken.deployed()
    ]);
  });

  // ============ Tests ============

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const positionId = BYTES32.TEST[0];
      const initialLender = ADDRESSES.TEST[7];
      const loanCaller1 = ADDRESSES.TEST[8];
      const loanCaller2 = ADDRESSES.TEST[9];

      const sharedLoanContract = await SharedLoan.new(
        positionId,
        dydxMargin.address,
        initialLender,
        [loanCaller1, loanCaller2]
      );

      const tsc = await getSharedLoanConstants(sharedLoanContract, initialLender);

      expect(tsc.MarginAddress).to.equal(dydxMargin.address);
      expect(tsc.InitialLender).to.equal(initialLender);
      expect(tsc.PositionId).to.equal(positionId);
      expect(tsc.State).to.be.bignumber.equal(SHARED_LOAN_STATE.UNINITIALIZED);
      expect(tsc.OwedToken).to.equal(ADDRESSES.ZERO);
      expect(tsc.HeldToken).to.equal(ADDRESSES.ZERO);
      expect(tsc.TotalPrincipal).to.be.bignumber.equal(0);
      expect(tsc.TotalPrincipalFullyWithdrawn).to.be.bignumber.equal(0);
      expect(tsc.TotalOwedTokenWithdrawn).to.be.bignumber.equal(0);
      expect(tsc.BalancesLender).to.be.bignumber.equal(0);
      expect(tsc.BalancesZero).to.be.bignumber.equal(0);
      expect(tsc.OwedTokenWithdrawnEarlyLender).to.be.bignumber.equal(0);
      expect(tsc.OwedTokenWithdrawnEarlyZero).to.be.bignumber.equal(0);

      const [lc1, lc2, lc3] = await Promise.all([
        sharedLoanContract.TRUSTED_MARGIN_CALLERS.call(loanCaller1),
        sharedLoanContract.TRUSTED_MARGIN_CALLERS.call(loanCaller2),
        sharedLoanContract.TRUSTED_MARGIN_CALLERS.call(initialLender)
      ]);

      expect(lc1).to.be.true;
      expect(lc2).to.be.true;
      expect(lc3).to.be.false;
    });
  });

  describe('#receiveLoanOwnership', () => {
    beforeEach('set up new positions and tokens', async () => {
      // Create new positions since state is modified by transferring them
      await setUpPosition();
      await setUpSharedLoan();
    });

    it('succeeds', async () => {
      const tsc1 = await getSharedLoanConstants(SHARED_LOAN.CONTRACT, SHARED_LOAN.INITIAL_LENDER);

      await transferLoanToSharedLoan();

      const [tsc2, position] = await Promise.all([
        getSharedLoanConstants(SHARED_LOAN.CONTRACT, SHARED_LOAN.INITIAL_LENDER),
        getPosition(dydxMargin, SHARED_LOAN.ID)
      ]);

      // expect certain values
      expect(tsc2.MarginAddress).to.equal(dydxMargin.address);
      expect(tsc2.InitialLender).to.equal(SHARED_LOAN.INITIAL_LENDER);
      expect(tsc2.PositionId).to.equal(SHARED_LOAN.ID);
      expect(tsc2.State).to.be.bignumber.equal(SHARED_LOAN_STATE.OPEN);
      expect(tsc2.OwedToken).to.equal(SHARED_LOAN.TX.loanOffering.owedToken);
      expect(tsc2.HeldToken).to.equal(SHARED_LOAN.TX.loanOffering.heldToken);
      expect(tsc2.TotalPrincipal).to.be.bignumber.equal(position.principal);
      expect(tsc2.TotalPrincipalFullyWithdrawn).to.be.bignumber.equal(0);
      expect(tsc2.TotalOwedTokenWithdrawn).to.be.bignumber.equal(0);
      expect(tsc2.BalancesLender).to.be.bignumber.equal(position.principal);
      expect(tsc2.BalancesZero).to.be.bignumber.equal(0);
      expect(tsc2.OwedTokenWithdrawnEarlyLender).to.be.bignumber.equal(0);
      expect(tsc2.OwedTokenWithdrawnEarlyZero).to.be.bignumber.equal(0);

      // explicity make sure some things have changed
      expect(tsc2.State).to.be.bignumber.not.equal(tsc1.State);
      expect(tsc2.HeldToken).to.not.equal(tsc1.HeldToken);
      expect(tsc2.OwedToken).to.not.equal(tsc1.OwedToken);
      expect(tsc2.TotalPrincipal).to.not.equal(tsc1.TotalPrincipal);
      expect(tsc2.BalancesLender).to.not.equal(tsc1.BalancesLender);

      // explicity make sure some things have not changed
      expect(tsc2.MarginAddress).to.equal(tsc1.MarginAddress);
      expect(tsc2.InitialLender).to.equal(tsc1.InitialLender);
      expect(tsc2.PositionId).to.equal(tsc1.PositionId);
      expect(tsc2.TotalPrincipalFullyWithdrawn)
        .to.be.bignumber.equal(tsc1.TotalPrincipalFullyWithdrawn);
      expect(tsc2.TotalOwedTokenWithdrawn)
        .to.be.bignumber.equal(tsc1.TotalOwedTokenWithdrawn);
      expect(tsc2.BalancesZero).to.be.bignumber.equal(tsc1.BalancesZero);
      expect(tsc2.OwedTokenWithdrawnEarlyLender)
        .to.be.bignumber.equal(tsc1.OwedTokenWithdrawnEarlyLender);
      expect(tsc2.OwedTokenWithdrawnEarlyZero)
        .to.be.bignumber.equal(tsc1.OwedTokenWithdrawnEarlyZero);
    });

    it('fails for msg.sender != Margin', async () => {
      await expectThrow(
        SHARED_LOAN.CONTRACT.receiveLoanOwnership(
          SHARED_LOAN.INITIAL_LENDER,
          SHARED_LOAN.ID,
          { from: SHARED_LOAN.INITIAL_LENDER}
        )
      );
    });
  });

  describe('#marginLoanIncreased', () => {
    beforeEach('transferPostion to one that will allow marginPostionIncreased', async () => {
      await setUpPosition();
      await setUpSharedLoan();
      await transferLoanToSharedLoan();
      await transferPositionToTestPositionOwner();
    });

    it('succeeds', async () => {
      // get constants before increasing position
      const tsc1 = await getSharedLoanConstants(SHARED_LOAN.CONTRACT, SHARED_LOAN.INITIAL_LENDER);

      const adder = accounts[8];
      const addedPrincipal = SHARED_LOAN.TX.principal.div(2);
      await increasePositionDirectly(adder, addedPrincipal);

      // get constants after increasing position
      const tsc2 = await getSharedLoanConstants(SHARED_LOAN.CONTRACT, adder);

      // check basic constants
      expect(tsc2.MarginAddress).to.equal(dydxMargin.address);
      expect(tsc2.InitialLender).to.equal(SHARED_LOAN.INITIAL_LENDER);
      expect(tsc2.PositionId).to.equal(SHARED_LOAN.ID);
      expect(tsc2.State).to.be.bignumber.equal(SHARED_LOAN_STATE.OPEN);
      expect(tsc2.OwedToken).to.equal(SHARED_LOAN.TX.loanOffering.owedToken);
      expect(tsc2.HeldToken).to.equal(SHARED_LOAN.TX.loanOffering.heldToken);
      expect(tsc2.TotalPrincipalFullyWithdrawn).to.be.bignumber.equal(0);
      expect(tsc2.TotalOwedTokenWithdrawn).to.be.bignumber.equal(0);
      expect(tsc2.BalancesZero).to.be.bignumber.equal(0);
      expect(tsc2.OwedTokenWithdrawnEarlyLender).to.be.bignumber.equal(0);
      expect(tsc2.OwedTokenWithdrawnEarlyZero).to.be.bignumber.equal(0);

      // check changed values
      expect(tsc2.TotalPrincipal).to.be.bignumber.equal(tsc1.TotalPrincipal.plus(addedPrincipal));
      expect(tsc2.BalancesLender).to.be.bignumber.equal(addedPrincipal);
    });

    it('fails for msg.sender != Margin', async () => {
      const increaseAmount = new BigNumber('1e18');
      await expectThrow(
        SHARED_LOAN.CONTRACT.marginLoanIncreased(
          SHARED_LOAN.INITIAL_LENDER,
          SHARED_LOAN.ID,
          increaseAmount,
          { from: SHARED_LOAN.INITIAL_LENDER}
        )
      );
    });
  });

  describe('#marginCallOnBehalfOf', () => {
    before('set up position', async () => {
      await setUpPosition();
      await setUpSharedLoan();
      await transferLoanToSharedLoan();
      const isCalled = await dydxMargin.isPositionCalled.call(SHARED_LOAN.ID);
      expect(isCalled).to.be.false;
    });

    it('fails if not authorized', async () => {
      await expectThrow(
        dydxMargin.marginCall(
          SHARED_LOAN.ID,
          BIGNUMBERS.ZERO,
          { from: SHARED_LOAN.INITIAL_LENDER }
        )
      );
    });

    it('succeeds if authorized', async () => {
      await dydxMargin.marginCall(
        SHARED_LOAN.ID,
        BIGNUMBERS.ZERO,
        { from: SHARED_LOAN.TRUSTED_MARGIN_CALLERS[0] }
      );
      const isCalled = await dydxMargin.isPositionCalled.call(SHARED_LOAN.ID);
      expect(isCalled).to.be.true;
    });
  });

  describe('#cancelMarginCallOnBehalfOf', () => {
    before('set up position and margin-call', async () => {
      await setUpPosition();
      await dydxMargin.marginCall(
        SHARED_LOAN.ID,
        BIGNUMBERS.ZERO,
        { from: SHARED_LOAN.TX.loanOffering.owner }
      );
      await setUpSharedLoan();
      await transferLoanToSharedLoan();
      const isCalled = await dydxMargin.isPositionCalled.call(SHARED_LOAN.ID);
      expect(isCalled).to.be.true;
    });

    it('fails if not authorized', async () => {
      await expectThrow(
        dydxMargin.cancelMarginCall(
          SHARED_LOAN.ID,
          { from: SHARED_LOAN.INITIAL_LENDER }
        )
      );
    });

    it('succeeds if authorized', async () => {
      await dydxMargin.cancelMarginCall(
        SHARED_LOAN.ID,
        { from: SHARED_LOAN.TRUSTED_MARGIN_CALLERS[0] }
      );
      const isCalled = await dydxMargin.isPositionCalled.call(SHARED_LOAN.ID);
      expect(isCalled).to.be.false;
    });
  });

  describe('#forceRecoverCollateralOnBehalfOf', () => {
    before('set up position and margin-call', async () => {
      // set up the position and margin-call
      await setUpPosition();
      await dydxMargin.marginCall(
        SHARED_LOAN.ID,
        BIGNUMBERS.ZERO,
        { from: SHARED_LOAN.TX.loanOffering.owner }
      );
      await setUpSharedLoan();
      await transferLoanToSharedLoan();

      // expect proper state of the position
      const [isClosed, isCalled, state] = await Promise.all([
        dydxMargin.isPositionClosed.call(SHARED_LOAN.ID),
        dydxMargin.isPositionCalled.call(SHARED_LOAN.ID),
        SHARED_LOAN.CONTRACT.state.call()
      ]);
      expect(isClosed).to.be.false;
      expect(isCalled).to.be.true;
      expect(state).to.be.bignumber.equal(SHARED_LOAN_STATE.OPEN);
    });

    it('succeeds for arbitrary caller', async () => {
      await wait(SHARED_LOAN.TX.loanOffering.callTimeLimit);

      await dydxMargin.forceRecoverCollateral(
        SHARED_LOAN.ID,
        { from: accounts[6] }
      );

      // expect proper state of the position
      const [isClosed, isCalled, state] = await Promise.all([
        dydxMargin.isPositionClosed.call(SHARED_LOAN.ID),
        dydxMargin.isPositionCalled.call(SHARED_LOAN.ID),
        SHARED_LOAN.CONTRACT.state.call()
      ]);
      expect(isClosed).to.be.true;
      expect(isCalled).to.be.false;
      expect(state).to.be.bignumber.equal(SHARED_LOAN_STATE.CLOSED);
    });
  });

  describe.only('#withdraw', () => {
    let accountA, accountB, accountC;

    // ============ Helper Functions ============

    async function callWithdraw(account) {
      const [owedBefore, heldBefore] = await Promise.all([
        owedToken.balanceOf.call(account),
        heldToken.balanceOf.call(account),
      ]);

      const retVal = await transact(SHARED_LOAN.CONTRACT.withdraw, account);
      const owedGotten = retVal.result[0];
      const heldGotten = retVal.result[1];

      const [owedAfter, heldAfter] = await Promise.all([
        owedToken.balanceOf.call(account),
        heldToken.balanceOf.call(account),
      ]);

      expect(owedAfter).to.be.bignumber.equal(owedBefore.plus(owedGotten));
      expect(heldAfter).to.be.bignumber.equal(heldBefore.plus(heldGotten));

      return {owedGotten, heldGotten};
    }

    // ============ Before ============

    before('Set up three lenders with equal equity in the position', async () => {
      await setUpPosition();
      await setUpSharedLoan();

      accountA = SHARED_LOAN.TX.loanOffering.owner;
      accountB = accounts[8];
      accountC = accounts[9];

      await dydxMargin.marginCall(
        SHARED_LOAN.ID,
        BIGNUMBERS.ZERO,
        { from: SHARED_LOAN.TX.loanOffering.owner }
      );
      await transferLoanToSharedLoan();
      await transferPositionToTestPositionOwner();
      await increasePositionDirectly(accountB, SHARED_LOAN.TX.principal);
      await increasePositionDirectly(accountC, SHARED_LOAN.TX.principal);

      // TODO:assert good state
    });

    // ============ Tests ============

    it('succeeds for complicated case', async () => {
      const thirdOfPrincipal = SHARED_LOAN.TX.principal;
      const closer = accounts[7];

      // close 1/3
      await issueTokenToAccountInAmountAndApproveProxy(
        owedToken,
        closer,
        thirdOfPrincipal.times(10)
      );
      await dydxMargin.closePositionDirectly(
        SHARED_LOAN.ID,
        thirdOfPrincipal,
        closer,
        { from: closer }
      );

      // withdraw accountA
      await callWithdraw(accountA);

      // close 1/3
      await issueTokenToAccountInAmountAndApproveProxy(
        owedToken,
        closer,
        thirdOfPrincipal.times(10)
      );
      await dydxMargin.closePositionDirectly(
        SHARED_LOAN.ID,
        thirdOfPrincipal,
        closer,
        { from: closer }
      );

      // withdraw accountB
      await callWithdraw(accountB);

      // call and forceRecover the last 1/3
      await wait(SHARED_LOAN.TX.loanOffering.callTimeLimit);
      await dydxMargin.forceRecoverCollateral(SHARED_LOAN.ID);

      // withdraw accountC
      await callWithdraw(accountC);


      // withdraw accountA
      await callWithdraw(accountA);


      // withdraw accountB
      await callWithdraw(accountB);

    });
  });

  describe('#withdrawAll', () => {
    //TODO(brendan)
  });

});
