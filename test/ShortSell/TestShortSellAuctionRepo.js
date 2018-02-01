/*global artifacts, web3, contract, describe, it, beforeEach*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const ShortSellAuctionRepo = artifacts.require("ShortSellAuctionRepo");

const { validateAccessControlledConstants } = require('../helpers/AccessControlledHelper');

contract('ShortSellAuctionRepo', function(accounts) {
  const [delay, gracePeriod] = [new BigNumber('123456'), new BigNumber('1234567')];
  let shortSellAuctionRepo;

  beforeEach(async () => {
    shortSellAuctionRepo = await ShortSellAuctionRepo.new(delay, gracePeriod);
    await ShortSellAuctionRepo.grantAccess(accounts[0]);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      await validateAccessControlledConstants(shortSellAuctionRepo, delay, gracePeriod);
    });
  });

  describe('#setAuctionOffer', () => {
    it('fails for non-approved account', async () => {
    });
    it('succeeds for an approved account', async () => {
    });
  });

  describe('#deleteAuctionOffer', () => {
    it('successfully transfers tokens into vault', async () => {
    });
    it('successfully transfers into different vaults', async () => {
    });
  });
});
