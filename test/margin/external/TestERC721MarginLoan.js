/*global artifacts, web3, contract, describe, it, before, beforeEach*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ERC721MarginLoan = artifacts.require("ERC721MarginLoan");
const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");

const { ADDRESSES, BIGNUMBERS, BYTES32 } = require('../../helpers/Constants');
const { expectThrow } = require('../../helpers/ExpectHelper');
const { createSignedSellOrder } = require('../../helpers/0xHelper');
const { getPartialAmount, uint256 } = require('../../helpers/MathHelper');
const { signLoanOffering } = require('../../helpers/LoanHelper');
const { expectLog } = require('../../helpers/EventHelper');
const {
  issueTokensAndSetAllowances,
  issueTokensAndSetAllowancesForClose,
  issueTokenToAccountInAmountAndApproveProxy,
  callClosePosition,
  callOpenPosition,
  doOpenPosition,
  createOpenTx
} = require('../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

describe('ERC721MarginLoan', () => {

  // ============ Constants ============

  let dydxMargin;
  let loanContract;
  let owedToken, heldToken;
  let salt = 471311;
  let openTx;

  // ============ Helper Functions ============

  async function loadContracts() {
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
  }

  async function setUpLoan(accounts) {
    openTx = await createOpenTx(accounts, salt++);
    openTx.loanOffering.owner = loanContract.address;
    openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
    await issueTokensAndSetAllowances(openTx);
    const temp = await callOpenPosition(dydxMargin, openTx);
    openTx.id = temp.id;

    const owner = await loanContract.ownerOf.call(uint256(openTx.id));
    expect(owner).to.be.equal(openTx.loanOffering.payer);
  }

  async function expectNoToken(positionId) {
    const tokenId = uint256(positionId);
    await expectThrow(
      loanContract.ownerOf.call(tokenId)
    );
    const [owedToken, owedTokenRepaid] = await Promise.all([
      loanContract.owedTokenAddress.call(tokenId),
      loanContract.owedTokensRepaidSinceLastWithdraw.call(tokenId)
    ]);
    expect(owedToken).to.be.bignumber.equal(0);
    expect(owedTokenRepaid).to.be.bignumber.equal(0);
  }

  // ============ Constructor ============

  contract('Constructor', function(accounts) {
    before('load contracts', async () => {
      await loadContracts(accounts);
    });

    it('sets constants correctly', async () => {
      await setUpLoan(accounts);
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
      expect(owedTokensRepaid).to.be.bignumber.equal(0);
      expect(owedTokenAddress).to.equal(ADDRESSES.ZERO);

      // Check ERC721 values
      expect(loanName).to.equal("dYdX ERC721 Margin Loans");
      expect(loanSymbol).to.equal("d/LO");
    });
  });

  // ============ approveCaller ============

  contract('#approveCaller', function(accounts) {
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

    before('load contracts', async () => {
      await loadContracts(accounts);
    });

    beforeEach('set up loan', async () => {
      await setUpLoan(accounts);

      // reset approval to false
      await loanContract.approveCaller(helper, false, { from: sender });
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

  // ============ untokenizeLoan ============

  contract('#untokenizeLoan', function(accounts) {
    const receiver = accounts[9];
    const lender = accounts[1];

    before('load contracts', async () => {
      await loadContracts(accounts);
    });

    beforeEach('set up loan', async () => {
      await setUpLoan(accounts);
      const owner = await loanContract.ownerOf.call(uint256(openTx.id));
      expect(owner).to.equal(lender);
    });

    it('succeeds when called by ownerOf', async () => {
      await loanContract.untokenizeLoan(openTx.id, receiver, { from: lender });
      await expectNoToken(openTx.id);
      const newOwner = await dydxMargin.getPositionLender.call(openTx.id);
      expect(newOwner).to.equal(receiver);
    });

    it('fails for a non-owner', async () => {
      await expectThrow(
        loanContract.untokenizeLoan(openTx.id, receiver, { from: accounts[2] }));
    });

    it('fails for a non-existant position', async () => {
      await expectThrow(
        loanContract.untokenizeLoan(BYTES32.BAD_ID, receiver, { from: lender }));
    });
  });

  // ============ receiveLoanOwnership ============

  contract('#receiveLoanOwnership', function(accounts) {
    before('load contracts', async () => {
      await loadContracts(accounts);
    });

    it('succeeds', async () => {
      const openTx1 = await doOpenPosition(accounts, salt++);
      const openTx2 = await doOpenPosition(accounts, salt++);

      // expect no erc721 tokens yet
      await expectNoToken(openTx1.id);
      await expectNoToken(openTx2.id);

      // close half of openTx2
      const sellOrder = await createSignedSellOrder(accounts);
      await issueTokensAndSetAllowancesForClose(openTx2, sellOrder);
      await callClosePosition(
        dydxMargin,
        openTx2,
        sellOrder,
        openTx2.principal.div(2)
      );

      // transfer loans to token contract
      await Promise.all([
        dydxMargin.transferLoan(
          openTx1.id,
          loanContract.address,
          { from: openTx1.loanOffering.owner }
        ),
        dydxMargin.transferLoan(
          openTx2.id,
          loanContract.address,
          { from: openTx2.loanOffering.owner }
        )
      ]);

      // get values
      const [
        owner1,
        owner2,
        owedTokenAddress1,
        owedTokenAddress2,
        repaid1,
        repaid2,
        expectedRepaid2
      ] = await Promise.all([
        loanContract.ownerOf.call(uint256(openTx1.id)),
        loanContract.ownerOf.call(uint256(openTx2.id)),
        loanContract.owedTokenAddress.call(uint256(openTx1.id)),
        loanContract.owedTokenAddress.call(uint256(openTx2.id)),
        loanContract.owedTokensRepaidSinceLastWithdraw.call(uint256(openTx1.id)),
        loanContract.owedTokensRepaidSinceLastWithdraw.call(uint256(openTx2.id)),
        dydxMargin.getTotalOwedTokenRepaidToLender.call(openTx2.id)
      ]);

      // expect certain values
      expect(owner1).to.equal(openTx1.loanOffering.owner);
      expect(owner2).to.equal(openTx2.loanOffering.owner);
      expect(owedTokenAddress1).to.equal(openTx1.loanOffering.owedToken);
      expect(owedTokenAddress2).to.equal(openTx2.loanOffering.owedToken);
      expect(repaid1).to.be.bignumber.equal(0);
      expect(repaid2).to.be.bignumber.equal(expectedRepaid2);
    });

    it('fails for msg.sender != Margin', async () => {
      const lender = accounts[1];
      await expectThrow(
        loanContract.receiveLoanOwnership(
          lender,
          BYTES32.TEST[0],
          { from: lender}
        )
      );
    });
  });

  // ============ marginLoanIncreased ============

  contract('#marginLoanIncreased', function(accounts) {
    before('load contracts', async () => {
      await loadContracts(accounts);
    });

    beforeEach('set up loan', async () => {
      await setUpLoan(accounts);
    });

    it('fails always', async () => {
      const adder = accounts[8];
      const addedPrincipal = openTx.principal.div(2);
      const [principal, amountHeld] = await Promise.all([
        dydxMargin.getPositionPrincipal(openTx.id),
        dydxMargin.getPositionBalance(openTx.id),
      ]);
      const heldTokenAmount = getPartialAmount(
        addedPrincipal,
        principal,
        amountHeld,
        true
      );
      await issueTokenToAccountInAmountAndApproveProxy(heldToken, adder, heldTokenAmount);
      await expectThrow(
        dydxMargin.increasePositionDirectly(
          openTx.id,
          addedPrincipal,
          { from: adder }
        )
      );
    });

    it('fails for msg.sender != Margin', async () => {
      const lender = accounts[1];
      const increaseAmount = new BigNumber('1e18');
      await expectThrow(
        loanContract.marginLoanIncreased(
          lender,
          openTx.id,
          increaseAmount,
          { from: lender }
        )
      );
    });
  });

  // ============ marginCallOnBehalfOf ============

  contract('#marginCallOnBehalfOf', function(accounts) {
    const caller = accounts[9];
    const rando = accounts[8];

    before('load contracts', async () => {
      await loadContracts();
    });

    beforeEach('set up loan', async () => {
      await setUpLoan(accounts);
      await loanContract.approveCaller(caller, true, { from: openTx.loanOffering.payer });
    });

    it('fails if not authorized', async () => {
      await expectThrow(
        dydxMargin.marginCall(
          openTx.id,
          BIGNUMBERS.ZERO,
          { from: rando }
        )
      );
    });

    it('succeeds if authorized', async () => {
      await dydxMargin.marginCall(
        openTx.id,
        BIGNUMBERS.ZERO,
        { from: caller }
      );
      const isCalled = await dydxMargin.isPositionCalled.call(openTx.id);
      expect(isCalled).to.be.true;
    });
  });

  // ============ cancelMarginCallOnBehalfOf ============

  contract('#cancelMarginCallOnBehalfOf', function(accounts) {
    const caller = accounts[9];
    const rando = accounts[8];

    before('load contracts', async () => {
      await loadContracts();
    });

    beforeEach('set up loan and margin-call', async () => {
      await setUpLoan(accounts);
      await loanContract.approveCaller(caller, true, { from: openTx.loanOffering.payer });
      await dydxMargin.marginCall(
        openTx.id,
        BIGNUMBERS.ZERO,
        { from: openTx.loanOffering.payer }
      );
      const isCalled = await dydxMargin.isPositionCalled.call(openTx.id);
      expect(isCalled).to.be.true;
    });

    it('fails if not authorized', async () => {
      await expectThrow(
        dydxMargin.cancelMarginCall(
          openTx.id,
          { from: rando }
        )
      );
    });

    it('succeeds if authorized', async () => {
      await dydxMargin.cancelMarginCall(
        openTx.id,
        { from: caller }
      );
      const isCalled = await dydxMargin.isPositionCalled.call(openTx.id);
      expect(isCalled).to.be.false;
    });
  });

  // ============ forceRecoverCollateralOnBehalfOf ============

  contract('#forceRecoverCollateralOnBehalfOf', function(accounts) {
    const recoverer = accounts[9];
    const rando = accounts[8];

    before('load contracts', async () => {
      await loadContracts();
    });

    beforeEach('set up loan', async () => {
      await setUpLoan(accounts);
      await dydxMargin.marginCall(
        openTx.id,
        BIGNUMBERS.ZERO,
        { from: openTx.loanOffering.payer }
      );
      await wait(openTx.loanOffering.callTimeLimit);
    });

    it('succeeds for arbitrary caller if recipient is owner', async () => {
      const [heldToken1, heldTokenInVault] = await Promise.all([
        heldToken.balanceOf.call(openTx.loanOffering.payer),
        dydxMargin.getPositionBalance.call(openTx.id)
      ]);

      await dydxMargin.forceRecoverCollateral(
        openTx.id,
        openTx.loanOffering.payer,
        { from: recoverer }
      );

      // expect proper state of the position
      const [isClosed, isCalled, heldToken2] = await Promise.all([
        dydxMargin.isPositionClosed.call(openTx.id),
        dydxMargin.isPositionCalled.call(openTx.id),
        heldToken.balanceOf.call(openTx.loanOffering.payer)
      ]);
      expect(isClosed).to.be.true;
      expect(isCalled).to.be.false;
      expect(heldToken2).to.be.bignumber.equal(heldToken1.plus(heldTokenInVault));
    });

    it('fails for arbitrary caller if recipient is NOT owner', async () => {
      await expectThrow(
        dydxMargin.forceRecoverCollateral(
          openTx.id,
          rando,
          { from: recoverer }
        )
      );
    });
  });
/*
  // ============ withdraw ============

  contract('#withdraw and #withdrawMultiple', function(accounts) {
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
*/
});
