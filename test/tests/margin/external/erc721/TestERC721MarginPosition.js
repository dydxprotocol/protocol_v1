const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ERC721MarginPosition = artifacts.require("ERC721MarginPosition");
const Margin = artifacts.require("Margin");
const TokenProxy = artifacts.require("TokenProxy");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");

const { BYTES32 } = require('../../../../helpers/Constants');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const { createSignedV1SellOrder } = require('../../../../helpers/ZeroExV1Helper');
const { uint256, getPartialAmount } = require('../../../../helpers/MathHelper');
const {
  doOpenPosition,
  issueTokensAndSetAllowancesForClose,
  issueTokenToAccountInAmountAndApproveProxy,
  callClosePosition,
  getMaxInterestFee,
  callClosePositionDirectly
} = require('../../../../helpers/MarginHelper');
const { issueAndSetAllowance } = require('../../../../helpers/TokenHelper');

contract('ERC721MarginPosition', accounts => {
  let dydxMargin, erc721Contract, heldToken, owedToken;
  let salt = 1111;

  before('retrieve deployed contracts', async () => {
    [
      dydxMargin,
      erc721Contract,
      heldToken,
      owedToken
    ] = await Promise.all([
      Margin.deployed(),
      ERC721MarginPosition.deployed(),
      HeldToken.deployed(),
      OwedToken.deployed()
    ]);
  });

  // ============ Constructor ============

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const contract = await ERC721MarginPosition.new(Margin.address);
      const dydxMarginAddress = await contract.DYDX_MARGIN.call();
      expect(dydxMarginAddress).to.equal(Margin.address);
    });
  });

  // ============ receivePositionOwnership ============

  describe('#receivePositionOwnership', () => {
    it('fails for arbitrary caller', async () => {
      await expectThrow(
        erc721Contract.receivePositionOwnership(accounts[0], BYTES32.BAD_ID));
    });

    it('succeeds for new position', async () => {
      const openTx = await doOpenPosition(
        accounts,
        {
          salt: salt++,
          positionOwner: ERC721MarginPosition.address
        }
      );
      const owner = await erc721Contract.ownerOf.call(uint256(openTx.id));
      expect(owner).to.equal(accounts[0]);
    });

    it('succeeds for half-closed position', async () => {
      const openTx = await doOpenPosition(accounts, { salt: salt++ });

      // close half the position
      const sellOrder = await createSignedV1SellOrder(accounts, { salt: salt++ });
      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
      await callClosePosition(
        dydxMargin,
        openTx,
        sellOrder,
        openTx.principal.div(2).floor());

      // transfer position to ERC20ShortFactory
      await dydxMargin.transferPosition(openTx.id, erc721Contract.address);
      const owner = await erc721Contract.ownerOf.call(uint256(openTx.id));
      expect(owner).to.equal(accounts[0]);
    });
  });

  // ============ getPositionDeedHolder ============

  describe('#getPositionDeedHolder', () => {
    it('fails for bad positionId', async () => {
      await expectThrow(
        erc721Contract.getPositionDeedHolder.call(BYTES32.BAD_ID));
    });

    it('succeeds for owned position', async () => {
      const openTx = await doOpenPosition(
        accounts,
        {
          salt: salt++,
          positionOwner: ERC721MarginPosition.address
        }
      );
      const deedHolder = await erc721Contract.getPositionDeedHolder.call(openTx.id);
      expect(deedHolder).to.equal(accounts[0]);
    });
  });

  // ============ marginPostionIncreased ============

  describe('#marginPostionIncreased', () => {
    let openTx;
    let addedPrincipal, heldTokenAmount;

    beforeEach('set up position', async () => {
      openTx = await doOpenPosition(
        accounts,
        {
          salt: salt++,
          positionOwner: ERC721MarginPosition.address
        }
      );
      addedPrincipal = openTx.principal.div(2).floor();
      const [principal, amountHeld] = await Promise.all([
        dydxMargin.getPositionPrincipal(openTx.id),
        dydxMargin.getPositionBalance(openTx.id),
      ]);
      heldTokenAmount = getPartialAmount(
        addedPrincipal,
        principal,
        amountHeld,
        true
      );
    });

    it('fails for non-deedHolder', async () => {
      await issueTokenToAccountInAmountAndApproveProxy(
        heldToken,
        openTx.loanOffering.owner,
        heldTokenAmount
      );

      await expectThrow(
        dydxMargin.increaseWithoutCounterparty(
          openTx.id,
          addedPrincipal,
          { from: openTx.loanOffering.owner }
        )
      );
    });

    it('succeeds for owner', async () => {
      await dydxMargin.transferLoan(
        openTx.id,
        openTx.trader,
        { from: openTx.loanOffering.owner }
      );

      await issueTokenToAccountInAmountAndApproveProxy(
        heldToken,
        openTx.trader,
        heldTokenAmount
      );

      await dydxMargin.increaseWithoutCounterparty(
        openTx.id,
        addedPrincipal,
        { from: openTx.trader }
      )
    });
  });

  // ============ depositOnBehalfOf ============

  describe('#depositOnBehalfOf', () => {
    let openTx;

    beforeEach('set up position', async () => {
      openTx = await doOpenPosition(
        accounts,
        {
          salt: salt++,
          positionOwner: ERC721MarginPosition.address
        }
      );
    });

    it('fails for non-owner', async () => {
      const heldTokenAmount = new BigNumber('1e18');
      const rando = accounts[8];

      await issueTokenToAccountInAmountAndApproveProxy(
        heldToken,
        rando,
        heldTokenAmount
      );

      await expectThrow(
        dydxMargin.depositCollateral(
          openTx.id,
          heldTokenAmount,
          { from: rando }
        )
      );
    });

    it('succeeds for owner', async () => {
      const heldTokenAmount = new BigNumber('1e18');

      await issueTokenToAccountInAmountAndApproveProxy(
        heldToken,
        openTx.trader,
        heldTokenAmount
      );

      await dydxMargin.depositCollateral(
        openTx.id,
        heldTokenAmount,
        { from: openTx.trader }
      );
    });
  });

  // ============ approveCloser ============

  describe('#approveCloser', () => {
    const sender = accounts[6];
    const helper = accounts[7];

    it('succeeds in approving', async () => {
      await erc721Contract.approveCloser(helper, true, { from: sender });
      const approved = await erc721Contract.approvedClosers.call(sender, helper);
      expect(approved).to.be.true;
    });

    it('succeeds in revoking approval', async () => {
      await erc721Contract.approveCloser(helper, true, { from: sender });
      await erc721Contract.approveCloser(helper, false, { from: sender });
      const approved = await erc721Contract.approvedClosers.call(sender, helper);
      expect(approved).to.be.false;
    });

    it('succeeds when true => true', async () => {
      await erc721Contract.approveCloser(helper, true, { from: sender });
      await erc721Contract.approveCloser(helper, true, { from: sender });
      const approved = await erc721Contract.approvedClosers.call(sender, helper);
      expect(approved).to.be.true;
    });

    it('succeeds when false => false', async () => {
      await erc721Contract.approveCloser(helper, true, { from: sender });
      await erc721Contract.approveCloser(helper, false, { from: sender });
      await erc721Contract.approveCloser(helper, false, { from: sender });
      const approved = await erc721Contract.approvedClosers.call(sender, helper);
      expect(approved).to.be.false;
    });

    it('throws when address approves itself', async () => {
      await expectThrow(
        erc721Contract.approveCloser(helper, true, { from: helper }));
    });
  });

  // ============ approveRecipient ============

  describe('#approveRecipient', () => {
    const sender = accounts[6];
    const recipient = accounts[7];

    it('succeeds in approving', async () => {
      await erc721Contract.approveRecipient(recipient, true, { from: sender });
      const approved = await erc721Contract.approvedRecipients.call(sender, recipient);
      expect(approved).to.be.true;
    });

    it('succeeds in revoking approval', async () => {
      await erc721Contract.approveRecipient(recipient, true, { from: sender });
      await erc721Contract.approveRecipient(recipient, false, { from: sender });
      const approved = await erc721Contract.approvedRecipients.call(sender, recipient);
      expect(approved).to.be.false;
    });

    it('succeeds when true => true', async () => {
      await erc721Contract.approveRecipient(recipient, true, { from: sender });
      await erc721Contract.approveRecipient(recipient, true, { from: sender });
      const approved = await erc721Contract.approvedRecipients.call(sender, recipient);
      expect(approved).to.be.true;
    });

    it('succeeds when false => false', async () => {
      await erc721Contract.approveRecipient(recipient, true, { from: sender });
      await erc721Contract.approveRecipient(recipient, false, { from: sender });
      await erc721Contract.approveRecipient(recipient, false, { from: sender });
      const approved = await erc721Contract.approvedRecipients.call(sender, recipient);
      expect(approved).to.be.false;
    });
  });

  // ============ untokenizePosition ============

  describe('#untokenizePosition', () => {
    const receiver = accounts[9];
    const trader = accounts[0];
    let openTx;

    beforeEach('sets up position', async () => {
      openTx = await doOpenPosition(
        accounts,
        {
          salt: salt++,
          positionOwner: ERC721MarginPosition.address
        }
      );
      const owner = await erc721Contract.ownerOf.call(uint256(openTx.id));
      expect(owner).to.equal(trader);
    });

    it('succeeds when called by ownerOf', async () => {
      await erc721Contract.untokenizePosition(openTx.id, receiver, { from: trader });
      await expectThrow(erc721Contract.ownerOf.call(uint256(openTx.id)));
      const newOwner = await dydxMargin.getPositionOwner.call(openTx.id);
      expect(newOwner).to.equal(receiver);
    });

    it('fails for a non-owner', async () => {
      await expectThrow(
        erc721Contract.untokenizePosition(openTx.id, receiver, { from: accounts[2] }));
    });

    it('fails for a non-existant position', async () => {
      await expectThrow(
        erc721Contract.untokenizePosition(BYTES32.BAD_ID, receiver, { from: trader }));
    });
  });

  // ============ burnClosedToken & burnClosedTokenMultiple  ============

  describe('#burnClosedToken & #burnClosedTokenMultiple', () => {
    let openTx;
    let positionIds = [];
    const numPositions = 2;

    async function initOwedToken(account) {
      const maxInterest = await getMaxInterestFee(openTx);
      const amount = openTx.principal.plus(maxInterest);
      await issueAndSetAllowance(
        owedToken,
        account,
        amount,
        TokenProxy.address
      );
    }

    beforeEach('sets up position and closes it', async () => {
      positionIds = [];
      for (let i = 0; i < numPositions; i++) {
        openTx = await doOpenPosition(
          accounts,
          {
            salt: salt++,
            positionOwner: ERC721MarginPosition.address
          }
        );
        await initOwedToken(openTx.trader);
        await callClosePositionDirectly(
          dydxMargin,
          openTx,
          openTx.principal,
          {
            from: openTx.trader,
            recipient: openTx.trader
          }
        );
        positionIds.push(openTx.id);
      }
    });

    it('burnClosedToken succeeds for closed positions', async () => {
      await Promise.all([
        erc721Contract.burnClosedToken(positionIds[0]),
        erc721Contract.burnClosedToken(positionIds[1]),
      ])
    });

    it('burnClosedToken fails for unclosed positions', async () => {
      await expectThrow(
        erc721Contract.burnClosedToken(BYTES32.TEST[5])
      );
    });

    it('burnClosedTokenMultiple succeeds for closed positions', async () => {
      await erc721Contract.burnClosedTokenMultiple(
        [positionIds[1], positionIds[0]]
      );
    });

    it('burnClosedTokenMultiple fails for unclosed positions', async () => {
      await expectThrow(
        erc721Contract.burnClosedTokenMultiple(
          [BYTES32.TEST[5], positionIds[1]]
        )
      );
    });

    it('burnClosedTokenMultiple fails for repeated positions', async () => {
      await expectThrow(
        erc721Contract.burnClosedTokenMultiple(
          [positionIds[1], positionIds[1]]
        )
      );
    });
  });

  // ============ closeOnBehalfOf ============

  describe('#closeOnBehalfOf', () => {
    let openTx;
    const approvedCloser = accounts[6];
    const approvedRecipient = accounts[7];
    const unapprovedAcct = accounts[9];

    async function initOwedToken(account) {
      const maxInterest = await getMaxInterestFee(openTx);
      const amount = openTx.principal.plus(maxInterest);
      await issueAndSetAllowance(
        owedToken,
        account,
        amount,
        TokenProxy.address
      );
    }

    beforeEach('sets up position', async () => {
      openTx = await doOpenPosition(
        accounts,
        {
          salt: salt++,
          positionOwner: ERC721MarginPosition.address
        }
      );
      await erc721Contract.approveCloser(approvedCloser, true, { from: openTx.trader });
      await erc721Contract.approveRecipient(approvedRecipient, true, { from: openTx.trader });
    });

    it('succeeds for owner', async () => {
      await initOwedToken(openTx.trader);
      await callClosePositionDirectly(
        dydxMargin,
        openTx,
        openTx.principal,
        {
          from: openTx.trader,
          recipient: unapprovedAcct
        }
      );
    });

    it('fails for token owned by ERC721MarginPosition contract', async () => {
      await initOwedToken(openTx.trader);
      await erc721Contract.transferFrom(openTx.trader, erc721Contract.address, uint256(openTx.id));
      await expectThrow(
        callClosePositionDirectly(
          dydxMargin,
          openTx,
          openTx.principal,
          {
            from: openTx.trader,
            recipient: unapprovedAcct
          }
        )
      );
    });

    it('succeeds for approved recipients', async () => {
      await initOwedToken(unapprovedAcct);
      await callClosePositionDirectly(
        dydxMargin,
        openTx,
        openTx.principal,
        {
          from: unapprovedAcct,
          recipient: approvedRecipient
        }
      );
    });

    it('succeeds for approved closers', async () => {
      await initOwedToken(approvedCloser);
      await callClosePositionDirectly(
        dydxMargin,
        openTx,
        openTx.principal,
        {
          from: approvedCloser,
          recipient: unapprovedAcct
        }
      );
    });

    it('fails for non-approved recipients/closers', async () => {
      await initOwedToken(unapprovedAcct);
      await expectThrow(callClosePositionDirectly(
        dydxMargin,
        openTx,
        openTx.principal,
        {
          from: unapprovedAcct,
          recipient: unapprovedAcct
        }
      ));
    });
  });
});
