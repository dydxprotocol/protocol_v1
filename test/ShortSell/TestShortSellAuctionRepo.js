/*global artifacts, contract, describe, it, beforeEach*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const ShortSellAuctionRepo = artifacts.require("ShortSellAuctionRepo");

const { expectThrow } = require('../helpers/ExpectHelper');
const { testAddrs } = require('../helpers/Constants');
const { validateAccessControlledConstants } = require('../helpers/AccessControlledHelper');

const accessDelay = new BigNumber('1234')
const gracePeriod = new BigNumber('12345');
const id1 =         '1234567';
const id2 =         '7654321';
const offer1 =      new BigNumber('1777111');
const offer2 =      new BigNumber('2777222');
const bidder1 =     testAddrs[1];
const bidder2 =     testAddrs[2];

contract('ShortSellAuctionRepo', function(accounts) {
  let shortSellAuctionRepo;

  beforeEach(async () => {
    shortSellAuctionRepo = await ShortSellAuctionRepo.new(accessDelay, gracePeriod);
    await shortSellAuctionRepo.grantAccess(accounts[1]);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      await validateAccessControlledConstants(shortSellAuctionRepo, accessDelay, gracePeriod);
    });
  });

  describe('#setAuctionOffer', () => {
    it('fails for non-approved account', async () => {
      await expectThrow(() =>
        shortSellAuctionRepo.setAuctionOffer(id1, offer1, bidder1, { from: accounts[2] }));
    });

    it('succeeds for an approved account', async () => {
      await shortSellAuctionRepo.setAuctionOffer(id1, offer1, bidder1, { from: accounts[1] });
      const [offer, bidder, exists] = await shortSellAuctionRepo.getAuction.call(id1);
      expect(offer.equals(offer1)).to.be.true;
      expect(bidder).to.equal(bidder1);
      expect(exists).to.be.true;
    });

    it('succeeds when called twice for the same ID', async () => {
      await shortSellAuctionRepo.setAuctionOffer(id1, offer1, bidder1, { from: accounts[1] });
      await shortSellAuctionRepo.setAuctionOffer(id1, offer2, bidder2, { from: accounts[1] });
      const [offer, bidder, exists] = await shortSellAuctionRepo.getAuction.call(id1);
      expect(offer.equals(offer2)).to.be.true;
      expect(bidder).to.equal(bidder2);
      expect(exists).to.be.true;
    });
  });

  describe('#deleteAuctionOffer', () => {
    beforeEach('create one auction offer', async () => {
      await shortSellAuctionRepo.setAuctionOffer(id1, offer1, bidder1, { from: accounts[1] });
    });

    it('fails for non-approved account', async () => {
      await expectThrow(() =>
        shortSellAuctionRepo.deleteAuctionOffer(id1, { from: accounts[2] }));
      const exists = await shortSellAuctionRepo.containsAuction.call(id1);
      expect(exists).to.be.true;
    });

    it('succeeds for an approved account', async () => {
      await shortSellAuctionRepo.deleteAuctionOffer(id1, { from: accounts[1] });
      const exists = await shortSellAuctionRepo.containsAuction.call(id1);
      expect(exists).to.be.false;
    });

    it('succeeds when called twice for the same ID', async () => {
      await shortSellAuctionRepo.deleteAuctionOffer(id1, { from: accounts[1] });
      await shortSellAuctionRepo.deleteAuctionOffer(id1, { from: accounts[1] });
      const exists = await shortSellAuctionRepo.containsAuction.call(id1);
      expect(exists).to.be.false;
    });

    it('succeeds when called for invalid ID', async () => {
      await shortSellAuctionRepo.deleteAuctionOffer(id2, { from: accounts[1] });
      let exists = await shortSellAuctionRepo.containsAuction.call(id1);
      expect(exists).to.be.true;
      exists = await shortSellAuctionRepo.containsAuction.call(id2);
      expect(exists).to.be.false;
    });
  });
});
