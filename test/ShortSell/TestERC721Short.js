/*global web3, artifacts, contract, describe, it, before, beforeEach,*/

const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const web3Instance = new Web3(web3.currentProvider);
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ERC721Short = artifacts.require("ERC721Short");
const ShortSell = artifacts.require("ShortSell");
const ProxyContract = artifacts.require("Proxy");
const BaseToken = artifacts.require("TokenB");

const { BYTES32 } = require('../helpers/Constants');
const { expectThrow } = require('../helpers/ExpectHelper');
const {
  doShort,
  issueTokensAndSetAllowancesForClose,
  callCloseShort,
  getMaxInterestFee
} = require('../helpers/ShortSellHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');

function uint256(shortId) {
  return new BigNumber(web3Instance.utils.toBN(shortId));
}

contract('ERC721Short', function(accounts) {
  let shortSellContract, ERC721ShortContract, baseToken;
  let salt = 1111;

  before('retrieve deployed contracts', async () => {
    [
      shortSellContract,
      ERC721ShortContract,
      baseToken
    ] = await Promise.all([
      ShortSell.deployed(),
      ERC721Short.deployed(),
      BaseToken.deployed()
    ]);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const contract = await ERC721Short.new(ShortSell.address);
      const shortSellContractAddress = await contract.SHORT_SELL.call();
      expect(shortSellContractAddress).to.equal(ShortSell.address);
    });
  });

  describe('#receiveShortOwnership', () => {
    it('fails for arbitrary caller', async () => {
      await expectThrow(
        () => ERC721ShortContract.receiveShortOwnership(accounts[0], BYTES32.BAD_ID));
    });

    it('succeeds for new short', async () => {
      const shortTx = await doShort(accounts, salt++, ERC721Short.address);
      const owner = await ERC721ShortContract.ownerOf.call(uint256(shortTx.id));
      expect(owner).to.equal(accounts[0]);
    });

    it('succeeds for half-closed short', async () => {
      const shortTx = await doShort(accounts, salt++);

      // close half the short
      const sellOrder = await createSignedSellOrder(accounts, salt++);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
      await callCloseShort(
        shortSellContract,
        shortTx,
        sellOrder,
        shortTx.shortAmount.div(2));

      // transfer short to ERC20ShortCreator
      await shortSellContract.transferShort(shortTx.id, ERC721ShortContract.address);
      const owner = await ERC721ShortContract.ownerOf.call(uint256(shortTx.id));
      expect(owner).to.equal(accounts[0]);
    });
  });

  describe('#getShortSellDeedHolder', () => {
    it('fails for bad shortId', async () => {
      await expectThrow(
        () => ERC721ShortContract.getShortSellDeedHolder(BYTES32.BAD_ID));
    });

    it('succeeds for owned short', async () => {
      const shortTx = await doShort(accounts, salt++, ERC721Short.address);
      const deedHolder = await ERC721ShortContract.getShortSellDeedHolder.call(shortTx.id);
      expect(deedHolder).to.equal(accounts[0]);
    });
  });

  describe('#approveCloser', () => {
    const sender = accounts[6];
    const helper = accounts[7];

    it('succeeds in approving', async () => {
      await ERC721ShortContract.approveCloser(helper, true, { from: sender });
      const approved = await ERC721ShortContract.approvedClosers.call(sender, helper);
      expect(approved).to.be.true;
    });

    it('succeeds in revoking approval', async () => {
      await ERC721ShortContract.approveCloser(helper, true, { from: sender });
      await ERC721ShortContract.approveCloser(helper, false, { from: sender });
      const approved = await ERC721ShortContract.approvedClosers.call(sender, helper);
      expect(approved).to.be.false;
    });

    it('succeeds when true => true', async () => {
      await ERC721ShortContract.approveCloser(helper, true, { from: sender });
      await ERC721ShortContract.approveCloser(helper, true, { from: sender });
      const approved = await ERC721ShortContract.approvedClosers.call(sender, helper);
      expect(approved).to.be.true;
    });

    it('succeeds when false => false', async () => {
      await ERC721ShortContract.approveCloser(helper, true, { from: sender });
      await ERC721ShortContract.approveCloser(helper, false, { from: sender });
      await ERC721ShortContract.approveCloser(helper, false, { from: sender });
      const approved = await ERC721ShortContract.approvedClosers.call(sender, helper);
      expect(approved).to.be.false;
    });

    it('throws when address approves itself', async () => {
      await expectThrow(
        () => ERC721ShortContract.approveCloser(helper, true, { from: helper }));
    });
  });

  describe('#approveRecipient', () => {
    const sender = accounts[6];
    const recipient = accounts[7];

    it('succeeds in approving', async () => {
      await ERC721ShortContract.approveRecipient(recipient, true, { from: sender });
      const approved = await ERC721ShortContract.approvedRecipients.call(sender, recipient);
      expect(approved).to.be.true;
    });

    it('succeeds in revoking approval', async () => {
      await ERC721ShortContract.approveRecipient(recipient, true, { from: sender });
      await ERC721ShortContract.approveRecipient(recipient, false, { from: sender });
      const approved = await ERC721ShortContract.approvedRecipients.call(sender, recipient);
      expect(approved).to.be.false;
    });

    it('succeeds when true => true', async () => {
      await ERC721ShortContract.approveRecipient(recipient, true, { from: sender });
      await ERC721ShortContract.approveRecipient(recipient, true, { from: sender });
      const approved = await ERC721ShortContract.approvedRecipients.call(sender, recipient);
      expect(approved).to.be.true;
    });

    it('succeeds when false => false', async () => {
      await ERC721ShortContract.approveRecipient(recipient, true, { from: sender });
      await ERC721ShortContract.approveRecipient(recipient, false, { from: sender });
      await ERC721ShortContract.approveRecipient(recipient, false, { from: sender });
      const approved = await ERC721ShortContract.approvedRecipients.call(sender, recipient);
      expect(approved).to.be.false;
    });
  });

  describe('#transferShort', () => {
    const receiver = accounts[9];
    const shortSeller = accounts[0];
    let shortTx;

    beforeEach('sets up short', async () => {
      shortTx = await doShort(accounts, salt++, ERC721Short.address);
      const owner = await ERC721ShortContract.ownerOf.call(uint256(shortTx.id));
      expect(owner).to.equal(shortSeller);
    });

    it('succeeds when called by ownerOf', async () => {
      await ERC721ShortContract.transferShort(shortTx.id, receiver, { from: shortSeller });
      await expectThrow(() => ERC721ShortContract.ownerOf.call(uint256(shortTx.id)));
      const newOwner = await shortSellContract.getShortSeller.call(shortTx.id);
      expect(newOwner).to.equal(receiver);
    });

    it('fails for a non-owner', async () => {
      await expectThrow(
        () => ERC721ShortContract.transferShort(shortTx.id, receiver, { from: accounts[2] }));
    });

    it('fails for a non-existant short', async () => {
      await expectThrow(
        () => ERC721ShortContract.transferShort(BYTES32.BAD_ID, receiver, { from: shortSeller }));
    });
  });

  describe('#closeOnBehalfOf', () => {
    let shortTx;
    const approvedCloser = accounts[6];
    const approvedRecipient = accounts[7];
    const unapprovedAcct = accounts[9];

    async function initBase(account) {
      const maxInterest = await getMaxInterestFee(shortTx);
      const amount = shortTx.shortAmount.plus(maxInterest);
      await baseToken.issueTo(account, amount);
      await baseToken.approve(ProxyContract.address, amount, { from: account });
    }

    beforeEach('sets up short', async () => {
      shortTx = await doShort(accounts, salt++, ERC721Short.address);
      await ERC721ShortContract.approveCloser(approvedCloser, true, { from: shortTx.seller });
      await ERC721ShortContract.approveRecipient(approvedRecipient, true, { from: shortTx.seller });
    });

    it('succeeds for owner', async () => {
      await initBase(shortTx.seller);
      await shortSellContract.closeShortDirectly(
        shortTx.id,
        shortTx.shortAmount,
        unapprovedAcct,
        { from: shortTx.seller }
      );
    });

    it('succeeds for approved recipients', async () => {
      await initBase(unapprovedAcct);
      await shortSellContract.closeShortDirectly(
        shortTx.id,
        shortTx.shortAmount,
        approvedRecipient,
        { from: unapprovedAcct }
      );
    });

    it('succeeds for approved closers', async () => {
      await initBase(approvedCloser);
      await shortSellContract.closeShortDirectly(
        shortTx.id,
        shortTx.shortAmount,
        unapprovedAcct,
        { from: approvedCloser }
      );
    });

    it('fails for non-approved recipients/closers', async () => {
      await initBase(unapprovedAcct);
      await expectThrow(() => shortSellContract.closeShortDirectly(
        shortTx.id,
        shortTx.shortAmount,
        unapprovedAcct,
        { from: unapprovedAcct }
      ));
    });
  });
});
