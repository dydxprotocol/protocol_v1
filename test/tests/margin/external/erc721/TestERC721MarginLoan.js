const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ERC721MarginLoan = artifacts.require("ERC721MarginLoan");
const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");

const { ADDRESSES, BIGNUMBERS, BYTES32 } = require('../../../../helpers/Constants');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const { createSignedV1SellOrder } = require('../../../../helpers/ZeroExV1Helper');
const { getPartialAmount, uint256 } = require('../../../../helpers/MathHelper');
const { transact } = require('../../../../helpers/ContractHelper');
const { signLoanOffering } = require('../../../../helpers/LoanHelper');
const { expectLog } = require('../../../../helpers/EventHelper');
const {
  issueTokensAndSetAllowances,
  issueTokensAndSetAllowancesForClose,
  issueTokenToAccountInAmountAndApproveProxy,
  callClosePosition,
  callOpenPosition,
  doOpenPosition,
  createOpenTx
} = require('../../../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

describe('ERC721MarginLoan', () => {

  // ============ Constants ============

  let dydxMargin;
  let loanContract;
  let owedToken, heldToken;
  let salt = 471311;
  let openTx;

  // ============ Helper-Functions ============

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

  async function setUpLoan(accounts, payer = null) {
    openTx = await createOpenTx(accounts, { salt: salt++ });
    if (payer) {
      openTx.loanOffering.payer = payer;
    }
    openTx.loanOffering.owner = loanContract.address;
    openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
    await issueTokensAndSetAllowances(openTx);
    const temp = await callOpenPosition(dydxMargin, openTx);
    openTx.id = temp.id;

    const owner = await loanContract.ownerOf.call(uint256(openTx.id));
    expect(owner).to.be.equal(openTx.loanOffering.payer);
    return openTx;
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

  async function closePosition(openTx, amount) {
    await issueTokenToAccountInAmountAndApproveProxy(
      owedToken,
      openTx.owner,
      amount.times(100)
    );
    await dydxMargin.closePositionDirectly(
      openTx.id,
      amount,
      openTx.owner,
      { from: openTx.owner }
    );
  }

  // ============ Constructor ============

  contract('Constructor', accounts => {
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
        loanContract.approvedManagers.call(accounts[0], accounts[1]),
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

  // ============ approveManager ============

  contract('#approveManager', accounts => {
    const sender = accounts[6];
    const helper = accounts[7];
    const eventName = 'ManagerApproval';
    const approvedEventTrue = {
      lender: sender,
      manager: helper,
      isApproved: true
    };
    const approvedEventFalse = {
      lender: sender,
      manager: helper,
      isApproved: false
    };

    before('load contracts', async () => {
      await loadContracts(accounts);
    });

    beforeEach('set up loan', async () => {
      await setUpLoan(accounts);

      // reset approval to false
      await loanContract.approveManager(helper, false, { from: sender });
    });

    it('succeeds in approving', async () => {
      const tx = await loanContract.approveManager(helper, true, { from: sender });
      const approved = await loanContract.approvedManagers.call(sender, helper);
      expect(approved).to.be.true;
      expectLog(tx.logs[0], eventName, approvedEventTrue);
    });

    it('succeeds in revoking approval', async () => {
      const tx1 = await loanContract.approveManager(helper, true, { from: sender });
      const tx2 = await loanContract.approveManager(helper, false, { from: sender });
      const approved = await loanContract.approvedManagers.call(sender, helper);
      expect(approved).to.be.false;
      expectLog(tx1.logs[0], eventName, approvedEventTrue);
      expectLog(tx2.logs[0], eventName, approvedEventFalse);
    });

    it('succeeds when true => true', async () => {
      const tx1 = await loanContract.approveManager(helper, true, { from: sender });
      const tx2 = await loanContract.approveManager(helper, true, { from: sender });
      const approved = await loanContract.approvedManagers.call(sender, helper);
      expect(approved).to.be.true;
      expectLog(tx1.logs[0], eventName, approvedEventTrue);
      expect(tx2.logs.length === 0);
    });

    it('succeeds when false => false', async () => {
      const tx1 = await loanContract.approveManager(helper, true, { from: sender });
      const tx2 = await loanContract.approveManager(helper, false, { from: sender });
      const tx3 = await loanContract.approveManager(helper, false, { from: sender });
      const approved = await loanContract.approvedManagers.call(sender, helper);
      expect(approved).to.be.false;
      expectLog(tx1.logs[0], eventName, approvedEventTrue);
      expectLog(tx2.logs[0], eventName, approvedEventFalse);
      expect(tx3.logs.length === 0);
    });

    it('throws when address approves itself', async () => {
      await expectThrow(
        loanContract.approveManager(helper, true, { from: helper })
      );
    });
  });

  // ============ untokenizeLoan ============

  contract('#untokenizeLoan', accounts => {
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

    it('fails for a non-wthdrawn position', async () => {
      await closePosition(openTx, openTx.principal.div(2).floor());
      await expectThrow(
        loanContract.untokenizeLoan(openTx.id, receiver, { from: lender })
      );
    });
  });

  // ============ receiveLoanOwnership ============

  contract('#receiveLoanOwnership', accounts => {
    before('load contracts', async () => {
      await loadContracts(accounts);
    });

    it('succeeds', async () => {
      const openTx1 = await doOpenPosition(accounts, { salt: salt++ });
      const openTx2 = await doOpenPosition(accounts, { salt: salt++ });

      // expect no erc721 tokens yet
      await expectNoToken(openTx1.id);
      await expectNoToken(openTx2.id);

      // close half of openTx2
      const sellOrder = await createSignedV1SellOrder(accounts);
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
        loanContract.owedTokenAddress.call(openTx1.id),
        loanContract.owedTokenAddress.call(openTx2.id),
        loanContract.owedTokensRepaidSinceLastWithdraw.call(openTx1.id),
        loanContract.owedTokensRepaidSinceLastWithdraw.call(openTx2.id),
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

  // ============ increaseLoanOnBehalfOf ============

  contract('#increaseLoanOnBehalfOf', accounts => {
    let heldTokenAmount, addedPrincipal;

    async function setupIncreaseLoanOnBehalfOf(adder) {
      const [principal, balance] = await Promise.all([
        dydxMargin.getPositionPrincipal(openTx.id),
        dydxMargin.getPositionBalance(openTx.id),
      ]);
      addedPrincipal = openTx.principal.div(2).floor();
      heldTokenAmount = getPartialAmount(
        addedPrincipal,
        principal,
        balance,
        true
      );
      await issueTokenToAccountInAmountAndApproveProxy(heldToken, adder, heldTokenAmount);
    }

    async function doIncrease(adder, throws) {
      if (throws) {
        await expectThrow(
          dydxMargin.increaseWithoutCounterparty(
            openTx.id,
            addedPrincipal,
            { from: adder }
          )
        );
      } else {
        await dydxMargin.increaseWithoutCounterparty(
          openTx.id,
          addedPrincipal,
          { from: adder }
        );
      }
    }

    before('load contracts', async () => {
      await loadContracts(accounts);
    });

    beforeEach('set up loan', async () => {
      await setUpLoan(accounts);
    });

    it('fails for non-owner', async () => {
      const adder = openTx.owner;
      await setupIncreaseLoanOnBehalfOf(adder);
      await doIncrease(adder, true);
    });

    it('fails if owner is ERC721 contract', async () => {
      const adder = openTx.loanOffering.payer;
      await setupIncreaseLoanOnBehalfOf(adder);
      await Promise.all([
        dydxMargin.transferPosition(openTx.id, adder, { from: openTx.owner }),
        loanContract.transferFrom(adder, loanContract.address, uint256(openTx.id), { from: adder })
      ]);
      await doIncrease(adder, true);
    });

    it('fails for msg.sender != Margin', async () => {
      const lender = accounts[1];
      const increaseAmount = new BigNumber('1e18');
      await expectThrow(
        loanContract.increaseLoanOnBehalfOf(
          lender,
          openTx.id,
          increaseAmount,
          increaseAmount,
          { from: lender }
        )
      );
    });

    it('succeeds for owner', async () => {
      const adder = openTx.loanOffering.payer;

      const [principal, balance] = await Promise.all([
        dydxMargin.getPositionPrincipal(openTx.id),
        dydxMargin.getPositionBalance(openTx.id),
      ]);

      await setupIncreaseLoanOnBehalfOf(adder);
      await dydxMargin.transferPosition(openTx.id, adder, { from: openTx.owner });
      await doIncrease(adder, false);

      const [finalBalance, finalPrincipal] = await Promise.all([
        dydxMargin.getPositionBalance.call(openTx.id),
        dydxMargin.getPositionPrincipal.call(openTx.id),
      ]);
      expect(finalPrincipal).to.be.bignumber.eq(principal.plus(addedPrincipal));
      expect(finalBalance).to.be.bignumber.eq(balance.plus(heldTokenAmount));
    });
  });

  // ============ marginCallOnBehalfOf ============

  contract('#marginCallOnBehalfOf', accounts => {
    const manager = accounts[9];
    const rando = accounts[8];

    before('load contracts', async () => {
      await loadContracts();
    });

    beforeEach('set up loan', async () => {
      await setUpLoan(accounts);
      await loanContract.approveManager(manager, true, { from: openTx.loanOffering.payer });
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
        { from: manager }
      );
      const isCalled = await dydxMargin.isPositionCalled.call(openTx.id);
      expect(isCalled).to.be.true;
    });
  });

  // ============ cancelMarginCallOnBehalfOf ============

  contract('#cancelMarginCallOnBehalfOf', accounts => {
    const manager = accounts[9];
    const rando = accounts[8];

    before('load contracts', async () => {
      await loadContracts();
    });

    beforeEach('set up loan and margin-call', async () => {
      await setUpLoan(accounts);
      await loanContract.approveManager(manager, true, { from: openTx.loanOffering.payer });
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
        { from: manager }
      );
      const isCalled = await dydxMargin.isPositionCalled.call(openTx.id);
      expect(isCalled).to.be.false;
    });
  });

  // ============ forceRecoverCollateralOnBehalfOf ============

  contract('#forceRecoverCollateralOnBehalfOf', accounts => {
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

    it('succeeds if caller is owner', async () => {
      const [heldToken1, heldTokenInVault] = await Promise.all([
        heldToken.balanceOf.call(rando),
        dydxMargin.getPositionBalance.call(openTx.id)
      ]);

      await dydxMargin.forceRecoverCollateral(
        openTx.id,
        rando,
        { from: openTx.loanOffering.payer  }
      );

      // expect proper state of the position
      const [isClosed, isCalled, heldToken2] = await Promise.all([
        dydxMargin.isPositionClosed.call(openTx.id),
        dydxMargin.isPositionCalled.call(openTx.id),
        heldToken.balanceOf.call(rando)
      ]);
      expect(isClosed).to.be.true;
      expect(isCalled).to.be.false;
      expect(heldToken2).to.be.bignumber.equal(heldToken1.plus(heldTokenInVault));
    });

    it('fails for arbitrary caller even if recipient is owner', async () => {
      await expectThrow(
        dydxMargin.forceRecoverCollateral(
          openTx.id,
          openTx.loanOffering.payer,
          { from: rando }
        )
      );
    });

    it('fails for manager and arbitrary recipient', async () => {
      const manager = accounts[9];
      const rando = accounts[8];
      await loanContract.approveManager(manager, true, { from: openTx.loanOffering.payer });

      await expectThrow(
        dydxMargin.forceRecoverCollateral(
          openTx.id,
          rando,
          { from: manager }
        )
      );

      await expectThrow(
        dydxMargin.forceRecoverCollateral(
          openTx.id,
          manager,
          { from: manager }
        )
      );
    });

    it('succeeds for manager if recipient is owner', async () => {
      const manager = accounts[9];
      await loanContract.approveManager(manager, true, { from: openTx.loanOffering.payer });

      await dydxMargin.forceRecoverCollateral(
        openTx.id,
        openTx.loanOffering.payer,
        { from: manager }
      );
    });
  });

  // ============ withdraw ============

  contract('#withdraw and #withdrawMultiple', accounts => {
    const lender1 = accounts[8];
    const lender2 = accounts[9];
    let openTx1, openTx2;
    let halfClose;

    // ============ Helper-Functions ============

    async function callWithdraw(positionId) {
      const lender = await loanContract.ownerOf.call(uint256(positionId));
      const owed1 = await owedToken.balanceOf.call(lender);
      const tx = await transact(loanContract.withdraw, positionId);
      const owedGotten = tx.result;
      const owed2 = await owedToken.balanceOf.call(lender);
      expect(owed2).to.be.bignumber.equal(owed1.plus(owedGotten));
      return owedGotten;
    }

    async function callWithdrawMultiple(ids) {
      const [
        owedToken1Before,
        owedToken2Before
      ] = await Promise.all([
        owedToken.balanceOf.call(lender1),
        owedToken.balanceOf.call(lender2),
      ]);

      let expectMap = {};

      for (let i in ids) {
        const positionId = ids[i];
        const result = await loanContract.withdraw.call(positionId);
        expectMap[positionId] = result;
      }

      await loanContract.withdrawMultiple(ids);

      const [
        owedToken1After,
        owedToken2After
      ] = await Promise.all([
        owedToken.balanceOf.call(lender1),
        owedToken.balanceOf.call(lender2),
      ]);

      expect(owedToken1After.minus(owedToken1Before)).to.be.bignumber.equal(
        expectMap[openTx1.id] || 0
      );
      expect(owedToken2After.minus(owedToken2Before)).to.be.bignumber.equal(
        expectMap[openTx2.id] || 0
      );
    }

    // ============ Before  ============

    before('load contracts', async () => {
      await loadContracts(accounts);
    });

    // ============ Before Each ============

    beforeEach('set up two loans, one is half-closed', async () => {
      // set up position 1
      openTx1 = await setUpLoan(accounts, lender1);

      // set up (half-closed) position 2
      openTx2 = await doOpenPosition(accounts, { salt: salt++ });
      await expectNoToken(openTx2.id);
      await closePosition(openTx2, openTx2.principal.div(2).floor());

      // expect same size
      expect(openTx1.principal).is.bignumber.equal(openTx2.principal);
      halfClose = openTx1.principal.div(2).floor();

      // transfer loans to erc721 contract
      await dydxMargin.transferLoan(
        openTx2.id,
        lender2,
        { from: openTx2.loanOffering.owner }
      );
      await dydxMargin.transferLoan(
        openTx2.id,
        loanContract.address,
        { from: lender2 }
      );

      const [owner1, owner2] = await Promise.all([
        loanContract.ownerOf.call(uint256(openTx1.id)),
        loanContract.ownerOf.call(uint256(openTx2.id))
      ]);
      expect(owner1).to.equal(lender1);
      expect(owner2).to.equal(lender2);
      expect(lender1).to.not.equal(lender2);
    });

    // ============ Tests ============

    it('#withdraw succeeds for complicated case', async () => {
      // Withdraw right away an expect nothing
      let [owedTokenWithdrawn1, owedTokenWithdrawn2] = await Promise.all([
        transact(loanContract.withdraw, openTx1.id),
        transact(loanContract.withdraw, openTx2.id)
      ]);
      expect(owedTokenWithdrawn1.result).to.be.bignumber.equal(0);
      expect(owedTokenWithdrawn2.result).to.be.bignumber.equal(0);

      // Get initial owedTokenRepaid for both
      const [totalRepaid1Before, totalRepaid2Before] = await Promise.all([
        dydxMargin.getTotalOwedTokenRepaidToLender.call(openTx1.id),
        dydxMargin.getTotalOwedTokenRepaidToLender.call(openTx2.id)
      ]);

      // Halfway close #1, completely close #2
      await closePosition(openTx1, openTx1.principal.div(2).floor());
      await closePosition(openTx2, openTx2.principal.div(2).floor());
      const [totalRepaid1After, totalRepaid2After, isClosed1, isClosed2] = await Promise.all([
        dydxMargin.getTotalOwedTokenRepaidToLender.call(openTx1.id),
        dydxMargin.getTotalOwedTokenRepaidToLender.call(openTx2.id),
        dydxMargin.isPositionClosed.call(openTx1.id),
        dydxMargin.isPositionClosed.call(openTx2.id)
      ]);
      expect(isClosed1).to.be.false;
      expect(isClosed2).to.be.true;


      // Withdraw tokens again and ensure that the right number was withdrawn
      [owedTokenWithdrawn1, owedTokenWithdrawn2] = await Promise.all([
        callWithdraw(openTx1.id),
        callWithdraw(openTx2.id)
      ]);
      expect(owedTokenWithdrawn1).to.be.bignumber.equal(
        totalRepaid1After.minus(totalRepaid1Before)
      );
      expect(owedTokenWithdrawn2).to.be.bignumber.equal(
        totalRepaid2After.minus(totalRepaid2Before)
      );

      // Wtihdrawing from 1 again yields nothing
      owedTokenWithdrawn1 = await callWithdraw(openTx1.id);
      expect(owedTokenWithdrawn1).to.be.bignumber.equal(0);

      // #2 is closed now so it doesn't exist.
      await expectThrow(loanContract.withdraw(openTx2.id));
      await expectThrow(loanContract.ownerOf.call(uint256(openTx2.id)));
    });

    it('#withdraw fails for invalid ID', async () => {
      await expectThrow(loanContract.withdraw(BYTES32.TEST[5]));
    });

    it('#withdrawMultiple succeeds for empty array', async () => {
      const arg = [];
      await callWithdrawMultiple(arg);
      await closePosition(openTx2, halfClose);
      await callWithdrawMultiple(arg);
      await closePosition(openTx1, halfClose);
      await callWithdrawMultiple(arg);
    });

    it('#withdrawMultiple succeeds for one position', async () => {
      const arg = [openTx1.id];
      await callWithdrawMultiple(arg);
      await closePosition(openTx1, halfClose);
      await callWithdrawMultiple(arg);
      await closePosition(openTx1, halfClose);
      await callWithdrawMultiple(arg);
    });

    it('#withdrawMultiple succeeds for multiple positions', async () => {
      const arg = [openTx1.id, openTx2.id];
      await callWithdrawMultiple(arg);
      await closePosition(openTx1, halfClose);
      await callWithdrawMultiple(arg);
      await closePosition(openTx2, halfClose);
      await callWithdrawMultiple(arg);
    });

    it('#withdrawMultiple succeeds when passed the same position multiple times', async () => {
      const arg = [openTx1.id, openTx2.id, openTx1.id];
      await callWithdrawMultiple(arg);
      await closePosition(openTx1, halfClose);
      await callWithdrawMultiple(arg);
      await closePosition(openTx2, halfClose);
      await callWithdrawMultiple(arg);
    });

    it('#withdrawMultiple fails for the same CLOSED position multiple times', async () => {
      const arg = [openTx2.id, openTx2.id];
      await callWithdrawMultiple(arg);
      await closePosition(openTx2, halfClose);
      await expectThrow(callWithdrawMultiple(arg));
    });
  });
});
