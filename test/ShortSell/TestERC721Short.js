/*global web3, artifacts, contract, describe, it, before, beforeEach,*/

const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const web3Instance = new Web3(web3.currentProvider);
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const ERC20Short = artifacts.require("ERC20Short");
const ERC721Short = artifacts.require("ERC721Short");
const BaseToken = artifacts.require("TokenA");
const ShortSell = artifacts.require("ShortSell");

const { ADDRESSES, BYTES32 } = require('../helpers/Constants');
const { TOKENIZED_SHORT_STATE } = require('../helpers/ERC20ShortHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const {
  doShort,
  issueTokensAndSetAllowancesForClose,
  callCloseShort,
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort
} = require('../helpers/ShortSellHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');

function uint256(shortId) {
  return new BigNumber(web3Instance.utils.toBN(shortId));
}

contract('ERC721Short', function(accounts) {
  let shortSellContract, ERC721ShortContract;
  let salt = 1111;

  before('retrieve deployed contracts', async () => {
    [
      shortSellContract,
      ERC721ShortContract
    ] = await Promise.all([
      ShortSell.deployed(),
      ERC721Short.deployed()
    ]);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const contract = await ERC721Short.new(ShortSell.address);
      const shortSellContractAddress = await contract.SHORT_SELL.call();
      expect(shortSellContractAddress).to.equal(ShortSell.address);
    });
  });

  describe('#recieveShortOwnership', () => {
    it('fails for arbitrary caller', async () => {
      await expectThrow(
        () => ERC721ShortContract.recieveShortOwnership(accounts[0], BYTES32.BAD_ID));
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
    const reciever = accounts[9];
    const shortSeller = accounts[0];
    let shortTx;

    beforeEach('sets up short', async () => {
      shortTx = await doShort(accounts, salt++, ERC721Short.address);
      const owner = await ERC721ShortContract.ownerOf.call(uint256(shortTx.id));
      expect(owner).to.equal(shortSeller);
    });

    it('succeeds when called by ownerOf', async () => {
      await ERC721ShortContract.transferShort(shortTx.id, reciever, { from: shortSeller });
      await expectThrow(() => ERC721ShortContract.ownerOf.call(uint256(shortTx.id)));
      const newOwner = await shortSellContract.getShortSeller.call(shortTx.id);
      expect(newOwner).to.equal(reciever);
    });

    it('fails for a non-owner', async () => {
      await expectThrow(
        () => ERC721ShortContract.transferShort(shortTx.id, reciever, { from: accounts[2] }));
    });

    it('fails for a non-existant short', async () => {
      await expectThrow(
        () => ERC721ShortContract.transferShort(BYTES32.BAD_ID, reciever, { from: shortSeller }));
    });
  });

  describe('#closeOnBehalfOf', () => {
    //TODO(brendanchou)
  });
});
