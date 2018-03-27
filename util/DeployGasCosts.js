/*global artifacts, describe, contract, it*/

const chai = require('chai');
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const ERC20Short = artifacts.require("ERC20Short");
const Vault = artifacts.require("Vault");
const ProxyContract = artifacts.require("Proxy");
const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const { getGasCost } = require('../test/helpers/NodeHelper');
const { ADDRESSES, BIGNUMBERS, BYTES32 } = require('../test/helpers/Constants');

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

  describe('Proxy', () => {
    it('', async () => {
      const contract = await ProxyContract.new(
        BIGNUMBERS.ONE_DAY_IN_SECONDS,
        BIGNUMBERS.ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tProxy deploy gas cost: ' + deployGasCost);
    });
  });

  describe('ERC20Short', () => {
    it('', async () => {
      const contract = await ERC20Short.new(
        BYTES32.ZERO,
        ADDRESSES.TEST[0],
        ADDRESSES.TEST[1],
        []
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tERC20Short deploy gas cost: ' + deployGasCost);
    });
  });

  describe('InterestImpl', () => {
    it('', async () => {
      await TestInterestImpl.link('InterestImpl', InterestImpl.address);
      const contract = await TestInterestImpl.new();
      const total = new BigNumber('1e18');
      const percent = new BigNumber('1e18');
      const rounding = new BigNumber(60 * 60 * 24); // no rounding

      async function printGasCost(seconds) {
        const tx = await contract.getCompoundedInterest(total, percent, seconds, rounding);
        console.log('\tInterestCalculation gas cost: ' + tx.receipt.gasUsed);
      }

      await printGasCost(new BigNumber(60 * 60 * 24 * 1));
      await printGasCost(new BigNumber(60 * 60 * 24 * 5));
      await printGasCost(new BigNumber(60 * 60 * 24 * 364));
      await printGasCost(new BigNumber(60 * 60 * 24 * 365));
    });
  });
});
