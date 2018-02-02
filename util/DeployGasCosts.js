/*global artifacts, describe, contract, it*/


const ShortSell = artifacts.require("ShortSell");
const Trader = artifacts.require("Trader");
const Vault = artifacts.require("Vault");
const ShortSellRepo = artifacts.require("ShortSellRepo");
const ShortSellAuctionRepo = artifacts.require("ShortSellAuctionRepo");
const ProxyContract = artifacts.require("Proxy");
const { getGasCost } = require('../test/helpers/NodeHelper');
const { testAddrs, ONE_DAY_IN_SECONDS } = require('../test/helpers/Constants');

contract('Deploy Costs', () => {
  describe('ShortSell', () => {
    it('', async () => {
      const contract = await ShortSell.new(
        testAddrs[0],
        testAddrs[1],
        testAddrs[2],
        testAddrs[3],
        testAddrs[4],
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tShortSell deploy gas cost: ' + deployGasCost);
    });
  });

  describe('Trader', () => {
    it('', async () => {
      const contract = await Trader.new(
        testAddrs[0],
        testAddrs[1],
        testAddrs[2],
        testAddrs[3],
        testAddrs[4],
        testAddrs[6],
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tTrader deploy gas cost: ' + deployGasCost);
    });
  });

  describe('Vault', () => {
    it('', async () => {
      const contract = await Vault.new(
        testAddrs[0],
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tVault deploy gas cost: ' + deployGasCost);
    });
  });

  describe('ShortSellRepo', () => {
    it('', async () => {
      const contract = await ShortSellRepo.new(
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tShortSellRepo deploy gas cost: ' + deployGasCost);
    });
  });

  describe('ShortSellAuctionRepo', () => {
    it('', async () => {
      const contract = await ShortSellAuctionRepo.new(
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tShortSellAuctionRepo deploy gas cost: ' + deployGasCost);
    });
  });

  describe('Proxy', () => {
    it('', async () => {
      const contract = await ProxyContract.new(
        ONE_DAY_IN_SECONDS,
        ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tProxy deploy gas cost: ' + deployGasCost);
    });
  });
});
