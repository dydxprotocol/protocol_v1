/*global artifacts, describe, contract, it*/


const ShortSell = artifacts.require("ShortSell");
const Trader = artifacts.require("Trader");
const Vault = artifacts.require("Vault");
const ShortSellRepo = artifacts.require("ShortSellRepo");
const ShortSellAuctionRepo = artifacts.require("ShortSellAuctionRepo");
const ProxyContract = artifacts.require("Proxy");
const { getGasCost } = require('../test/helpers/NodeHelper');
const { ADDRESSES, BIGNUMBERS } = require('../test/helpers/Constants');

contract('Deploy Costs', () => {
  describe('ShortSell', () => {
    it('', async () => {
      const contract = await ShortSell.new(
        ADDRESSES.TEST[0],
        ADDRESSES.TEST[1],
        ADDRESSES.TEST[2],
        ADDRESSES.TEST[3],
        ADDRESSES.TEST[4]
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tShortSell deploy gas cost: ' + deployGasCost);
    });
  });

  describe('Trader', () => {
    it('', async () => {
      const contract = await Trader.new(
        ADDRESSES.TEST[0],
        ADDRESSES.TEST[1],
        ADDRESSES.TEST[2],
        ADDRESSES.TEST[3],
        ADDRESSES.TEST[4],
        ADDRESSES.TEST[6],
        BIGNUMBERS.ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tTrader deploy gas cost: ' + deployGasCost);
    });
  });

  describe('Vault', () => {
    it('', async () => {
      const contract = await Vault.new(
        ADDRESSES.TEST[0],
        ADDRESSES.TEST[1],
        BIGNUMBERS.ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tVault deploy gas cost: ' + deployGasCost);
    });
  });

  describe('ShortSellRepo', () => {
    it('', async () => {
      const contract = await ShortSellRepo.new(
        BIGNUMBERS.ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tShortSellRepo deploy gas cost: ' + deployGasCost);
    });
  });

  describe('ShortSellAuctionRepo', () => {
    it('', async () => {
      const contract = await ShortSellAuctionRepo.new(
        BIGNUMBERS.ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tShortSellAuctionRepo deploy gas cost: ' + deployGasCost);
    });
  });

  describe('Proxy', () => {
    it('', async () => {
      const contract = await ProxyContract.new(
        BIGNUMBERS.ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tProxy deploy gas cost: ' + deployGasCost);
    });
  });
});
