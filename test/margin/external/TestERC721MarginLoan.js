/*global artifacts, web3, contract, describe, it, before, beforeEach*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ERC721MarginLoan = artifacts.require("ERC721MarginLoan");
const Margin = artifacts.require("Margin");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");

const { transact } = require('../../helpers/ContractHelper');
const { ADDRESSES, BIGNUMBERS, BYTES32 } = require('../../helpers/Constants');
const { expectThrow } = require('../../helpers/ExpectHelper');
const { getSharedLoanConstants, SHARED_LOAN_STATE } = require('./SharedLoanHelper');
const { getPartialAmount } = require('../../helpers/MathHelper');
const { signLoanOffering } = require('../../helpers/LoanHelper');
const { expectLog } = require('../../helpers/EventHelper');
const {
  issueTokenToAccountInAmountAndApproveProxy,
  callOpenPosition,
  getPosition,
  createOpenTx
} = require('../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

describe('ERC721MarginLoan', function(accounts) {

  // ============ Constants ============

  let dydxMargin;
  let loanContract;
  let owedToken, heldToken;
  let salt = 471311;
  let openTx;

  // ============ Helper Functions ============

  async function setUpLoan() {
    [
      dydxMargin,
      owedToken,
      heldToken
    ] = await Promise.all([
      Margin.deployed(),
      OwedToken.deployed(),
      HeldToken.deployed()
    ]);
    loanContract = await ERC721MarginLoan.new(dydxMargin.address);
    openTx = createOpenTx(accounts);
    openTx.loanOffering.owner = loanContract;
    openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
    openTx = await callOpenPosition(dydxMargin, openTx);
  }

  // ============ Constructor ============

  contract('Constructor', () => {
    it('sets constants correctly', async () => {
      const [
        marginAddress,
        isApproved,
        owedTokensRepaid,
        owedTokenAddress,
        loanName,
        loanSymbol
      ] = await Promise.all([
        loanContract.DYDX_MARGIN.call(),
        loanContract.approvedCallers.call(accounts[0], accounts[1]),
        loanContract.owedTokensRepaidSinceLastWithdraw.call(BYTES32.TEST[0]),
        loanContract.owedTokenAddress.call(BYTES32.TEST[0]),
        loanContract.name.call(),
        loanContract.symbol.call()
      ]);

      // Check margin address
      expect(marginAddress).to.equal(dydxMargin.address);

      // Check random values in mappings
      expect(isApproved).to.be.false;
      expect(owedTokensRepaid).to.be.bignumber(0);
      expect(owedTokenAddress).to.equal(ADDRESSES.ZERO);

      // Check ERC721 values
      expect(loanName).to.equal("dYdX ERC721 Margin Loans");
      expect(loanSymbol).to.equal("d/LO");
    });
  });

  // ============ receiveLoanOwnership ============

  contract('#approveCaller', () => {
    const sender = accounts[6];
    const helper = accounts[7];
    const eventName = 'MarginCallerApproval';
    const approvedEventTrue = {
      lender: sender,
      caller: helper,
      isApproved: true
    };
    const approvedEventFalse = {
      lender: sender,
      caller: helper,
      isApproved: false
    };

    beforeEach('set up loan', async () => {
      await setUpLoan();
    });

    it('succeeds in approving', async () => {
      const tx = await loanContract.approveCaller(helper, true, { from: sender });
      const approved = await loanContract.approvedCallers.call(sender, helper);
      expect(approved).to.be.true;
      expectLog(tx.logs[0], eventName, approvedEventTrue);
    });

    it('succeeds in revoking approval', async () => {
      const tx1 = await loanContract.approveCaller(helper, true, { from: sender });
      const tx2 = await loanContract.approveCaller(helper, false, { from: sender });
      const approved = await loanContract.approvedCallers.call(sender, helper);
      expect(approved).to.be.false;
      expectLog(tx1.logs[0], eventName, approvedEventTrue);
      expectLog(tx2.logs[0], eventName, approvedEventFalse);
    });

    it('succeeds when true => true', async () => {
      const tx1 = await loanContract.approveCaller(helper, true, { from: sender });
      const tx2 = await loanContract.approveCaller(helper, true, { from: sender });
      const approved = await loanContract.approvedCallers.call(sender, helper);
      expect(approved).to.be.true;
      expectLog(tx1.logs[0], eventName, approvedEventTrue);
      expect(tx2.logs.length === 0);
    });

    it('succeeds when false => false', async () => {
      const tx1 = await loanContract.approveCaller(helper, true, { from: sender });
      const tx2 = await loanContract.approveCaller(helper, false, { from: sender });
      const tx3 = await loanContract.approveCaller(helper, false, { from: sender });
      const approved = await loanContract.approvedCallers.call(sender, helper);
      expect(approved).to.be.false;
      expectLog(tx1.logs[0], eventName, approvedEventTrue);
      expectLog(tx2.logs[0], eventName, approvedEventFalse);
      expect(tx3.logs.length === 0);
    });

    it('throws when address approves itself', async () => {
      await expectThrow(
        loanContract.approveCaller(helper, true, { from: helper })
      );
    });
  });

  contract('#receiveLoanOwnership', () => {
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

  // ============ marginLoanIncreased ============

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

  // ============ marginCallOnBehalfOf ============

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

  // ============ cancelMarginCallOnBehalfOf ============

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

  // ============ forceRecoverCollateralOnBehalfOf ============

  describe('#forceRecoverCollateralOnBehalfOf', () => {
    beforeEach('set up position and margin-call', async () => {
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

    it('succeeds for arbitrary caller if recipient is sharedLoan', async () => {
      await wait(SHARED_LOAN.TX.loanOffering.callTimeLimit);

      await dydxMargin.forceRecoverCollateral(
        SHARED_LOAN.ID,
        SHARED_LOAN.CONTRACT.address,
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

    it('fails for arbitrary caller if recipient is NOT sharedLoan', async () => {
      await wait(SHARED_LOAN.TX.loanOffering.callTimeLimit);

      await expectThrow(
        dydxMargin.forceRecoverCollateral(
          SHARED_LOAN.ID,
          ADDRESSES.TEST[8],
          { from: accounts[6] }
        )
      );
    });
  });

  // ============ withdraw ============

  describe('#withdraw and #withdrawMultiple', () => {
    let accountA, accountB, accountC;
    let principalShare;
    const closer = accounts[6];

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

    async function withdrawAccount(account, runningTally) {
      // withdraw once and validate change
      const w1 = await callWithdraw(account);
      runningTally.heldToken = new BigNumber(runningTally.heldToken).plus(w1.heldGotten);
      runningTally.owedToken = new BigNumber(runningTally.owedToken).plus(w1.owedGotten);

      // withdraw again and expect no change
      const w2 = await callWithdraw(account);
      expect(w2.owedGotten).to.be.bignumber.equal(0);
      expect(w2.heldGotten).to.be.bignumber.equal(0);

      return runningTally;
    }

    async function closeAmount(closer, amount) {
      await issueTokenToAccountInAmountAndApproveProxy(
        owedToken,
        closer,
        amount.times(100)
      );
      await dydxMargin.closePositionDirectly(
        SHARED_LOAN.ID,
        amount,
        closer,
        { from: closer }
      );
    }

    async function expectSharedLoanBalances(expectedBalances) {
      const[balA, balB, balC] = await Promise.all([
        SHARED_LOAN.CONTRACT.balances.call(accountA),
        SHARED_LOAN.CONTRACT.balances.call(accountB),
        SHARED_LOAN.CONTRACT.balances.call(accountC)
      ]);
      expect(balA).to.be.bignumber.equal(expectedBalances[0]);
      expect(balB).to.be.bignumber.equal(expectedBalances[1]);
      expect(balC).to.be.bignumber.equal(expectedBalances[2]);
    }

    async function callWithdrawMultiple(arg) {
      const [
        heldA1,
        owedA1,
        heldB1,
        owedB1,
        heldC1,
        owedC1,
      ] = await Promise.all([
        heldToken.balanceOf.call(accountA),
        owedToken.balanceOf.call(accountA),
        heldToken.balanceOf.call(accountB),
        owedToken.balanceOf.call(accountB),
        heldToken.balanceOf.call(accountC),
        owedToken.balanceOf.call(accountC),
      ]);

      let expectMap = {};
      expectMap[accountA] = [0,0];
      expectMap[accountB] = [0,0];
      expectMap[accountC] = [0,0];

      for (let i in arg) {
        const account = arg[i];
        const vals = await SHARED_LOAN.CONTRACT.withdraw.call(account);
        expectMap[account] = [vals[0], vals[1]];
      }

      await SHARED_LOAN.CONTRACT.withdrawMultiple(arg);

      const [
        heldA2,
        owedA2,
        heldB2,
        owedB2,
        heldC2,
        owedC2,
      ] = await Promise.all([
        heldToken.balanceOf.call(accountA),
        owedToken.balanceOf.call(accountA),
        heldToken.balanceOf.call(accountB),
        owedToken.balanceOf.call(accountB),
        heldToken.balanceOf.call(accountC),
        owedToken.balanceOf.call(accountC),
      ]);

      expect(owedA2.minus(owedA1)).to.be.bignumber.equal(expectMap[accountA][0]);
      expect(owedB2.minus(owedB1)).to.be.bignumber.equal(expectMap[accountB][0]);
      expect(owedC2.minus(owedC1)).to.be.bignumber.equal(expectMap[accountC][0]);
      expectWithinError(heldA2.minus(heldA1), expectMap[accountA][1], 1);
      expectWithinError(heldB2.minus(heldB1), expectMap[accountB][1], 1);
      expectWithinError(heldC2.minus(heldC1), expectMap[accountC][1], 1);

      const isClosed = await dydxMargin.isPositionClosed.call(SHARED_LOAN.ID);
      const principalPer = SHARED_LOAN.TX.principal;
      if (isClosed) {
        await expectSharedLoanBalances([
          arg.indexOf(accountA) >= 0 ? 0 : principalPer,
          arg.indexOf(accountB) >= 0 ? 0 : principalPer,
          arg.indexOf(accountC) >= 0 ? 0 : principalPer,
        ]);
      } else {
        await expectSharedLoanBalances([
          principalPer, principalPer, principalPer
        ]);
      }
    }

    async function callForceRecover() {
      await dydxMargin.marginCall(
        SHARED_LOAN.ID,
        BIGNUMBERS.ZERO,
        { from: SHARED_LOAN.TRUSTED_MARGIN_CALLERS[0] }
      );
      await wait(SHARED_LOAN.TX.loanOffering.callTimeLimit);
      await dydxMargin.forceRecoverCollateral(SHARED_LOAN.ID, SHARED_LOAN.CONTRACT.address);
    }

    // ============ Before Each ============

    beforeEach('Set up three lenders with equal equity in the position', async () => {
      principalShare = SHARED_LOAN.TX.principal;
      await setUpPosition();
      await setUpSharedLoan();

      accountA = SHARED_LOAN.INITIAL_LENDER;
      accountB = accounts[7];
      accountC = accounts[8];
      expect(accountA).to.not.equal(accountB);
      expect(accountB).to.not.equal(accountC);
      expect(accountC).to.not.equal(accountA);

      await transferLoanToSharedLoan();
      await transferPositionToTestPositionOwner();
      await increasePositionDirectly(accountB, SHARED_LOAN.TX.principal);
      await increasePositionDirectly(accountC, SHARED_LOAN.TX.principal);

      // Check balances
      await expectSharedLoanBalances([
        SHARED_LOAN.TX.principal, SHARED_LOAN.TX.principal, SHARED_LOAN.TX.principal]
      );
    });

    // ============ Tests ============

    it('#withdraw succeeds for complicated case', async () => {
      let runningTallyA = {heldToken: 0, owedToken: 0};
      let runningTallyB = {heldToken: 0, owedToken: 0};
      let runningTallyC = {heldToken: 0, owedToken: 0};

      // close 1/3
      await closeAmount(closer, principalShare);

      // withdraw accountA
      runningTallyA = await withdrawAccount(accountA, runningTallyA);

      // close 1/3
      await closeAmount(closer, principalShare);

      // withdraw accountB
      runningTallyB = await withdrawAccount(accountB, runningTallyB);

      // call and forceRecover the last 1/3
      await callForceRecover();

      // withdraw accountC
      runningTallyC = await withdrawAccount(accountC, runningTallyC);

      // withdraw accountA
      runningTallyA = await withdrawAccount(accountA, runningTallyA);

      // withdraw accountB
      runningTallyB = await withdrawAccount(accountB, runningTallyB);

      // expect owedToken received to be exactly equal
      expect(runningTallyA.owedToken)
        .to.be.bignumber.equal(runningTallyA.owedToken)
        .to.be.bignumber.equal(runningTallyA.owedToken);

      // expect heldToken received to be within 1 of each other
      expectWithinError(runningTallyA.heldToken, runningTallyB.heldToken, 1);
      expectWithinError(runningTallyB.heldToken, runningTallyC.heldToken, 1);
      expectWithinError(runningTallyC.heldToken, runningTallyA.heldToken, 1);

      // expect no balances remaining
      await expectSharedLoanBalances([0, 0, 0]);

      // expect few tokens locked in SharedLoan contract
      {
        const[balO, balH] = await Promise.all([
          owedToken.balanceOf.call(SHARED_LOAN.CONTRACT.address),
          heldToken.balanceOf.call(SHARED_LOAN.CONTRACT.address),
        ]);
        expectWithinError(balO, 0, 3); // expect balance of owedToken to be at most 3
        expect(balH).to.be.bignumber.equal(0);
      }

      // expect no new tokens
      {
        const [remainingA, remainingB, remainingC] = await Promise.all([
          callWithdraw(accountA),
          callWithdraw(accountB),
          callWithdraw(accountC)
        ]);
        expect(remainingA.owedGotten).to.be.bignumber.equal(0);
        expect(remainingA.heldGotten).to.be.bignumber.equal(0);
        expect(remainingB.owedGotten).to.be.bignumber.equal(0);
        expect(remainingB.heldGotten).to.be.bignumber.equal(0);
        expect(remainingC.owedGotten).to.be.bignumber.equal(0);
        expect(remainingC.heldGotten).to.be.bignumber.equal(0);
      }
    });

    it('#withdrawMultiple succeeds for zero accounts', async () => {
      const arg = [];
      await callWithdrawMultiple(arg);
      await closeAmount(closer, principalShare);
      await callWithdrawMultiple(arg);
      await closeAmount(closer, principalShare);
      await callForceRecover();
      await callWithdrawMultiple(arg);
    });

    it('#withdrawMultiple succeeds for one account', async () => {
      const arg = [accountB];
      await callWithdrawMultiple(arg);
      await closeAmount(closer, principalShare);
      await callWithdrawMultiple(arg);
      await closeAmount(closer, principalShare);
      await callForceRecover();
      await callWithdrawMultiple(arg);
    });

    it('#withdrawMultiple succeeds for multiple accounts', async () => {
      const arg = [accountC, accountB];
      await callWithdrawMultiple(arg);
      await closeAmount(closer, principalShare);
      await callWithdrawMultiple(arg);
      await closeAmount(closer, principalShare);
      await callForceRecover();
      await callWithdrawMultiple(arg);
    });

    it('#withdrawMultiple succeeds when passed the same account multiple times', async () => {
      const arg = [accountB, accountA, accountB, accountB];
      await callWithdrawMultiple(arg);
      await closeAmount(closer, principalShare);
      await callWithdrawMultiple(arg);
      await closeAmount(closer, principalShare);
      await callForceRecover();
      await callWithdrawMultiple(arg);
    });
  });

});
