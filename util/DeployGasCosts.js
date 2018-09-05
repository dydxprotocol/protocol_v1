/*global artifacts, describe, contract, it*/

const chai = require('chai');
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const ERC20Short = artifacts.require("ERC20Short");
const Vault = artifacts.require("Vault");
const TokenProxy = artifacts.require("TokenProxy");
const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const BucketLenderFactory = artifacts.require("BucketLenderFactory");
const { getGasCost } = require('../test/helpers/NodeHelper');
const { ADDRESSES, BIGNUMBERS, BYTES32 } = require('../test/helpers/Constants');

contract('Deploy Costs', () => {
  describe('Margin', () => {
    it('', async () => {
      const contract = await Margin.new(
        ADDRESSES.TEST[0],
        ADDRESSES.TEST[1],
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tMargin deploy gas cost: ' + deployGasCost);
    });
  });

  describe('Vault', () => {
    it('', async () => {
      const contract = await Vault.new(
        ADDRESSES.TEST[0],
        BIGNUMBERS.ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tVault deploy gas cost: ' + deployGasCost);
    });
  });

  describe('TokenProxy', () => {
    it('', async () => {
      const contract = await TokenProxy.new(
        BIGNUMBERS.ONE_DAY_IN_SECONDS
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tTokenProxy deploy gas cost: ' + deployGasCost);
    });
  });

  describe('ERC20Short', () => {
    it('', async () => {
      const contract = await ERC20Short.new(
        BYTES32.ZERO,
        ADDRESSES.TEST[0],
        ADDRESSES.TEST[1],
        [],
        []
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tERC20Short deploy gas cost: ' + deployGasCost);
    });
  });

  describe('BucketLenderFactory', () => {
    it('', async () => {
      const contract = await BucketLenderFactory.new(
        ADDRESSES.TEST[0],
      );

      const deployGasCost = await getGasCost(contract.transactionHash);
      console.log('\tBucketLenderFactory deploy gas cost: ' + deployGasCost);
    });
  });

  describe('InterestImpl', () => {
    it('', async () => {
      await TestInterestImpl.link('InterestImpl', InterestImpl.address);
      const contract = await TestInterestImpl.new();
      const tokens1 = new BigNumber('1e18');
      const tokens2 = new BigNumber('1e40');
      const percent = new BigNumber('1e6');

      async function printGasCost(seconds) {
        const tx = await contract.getCompoundedInterest(tokens1, percent, seconds);
        console.log('\tInterestCalculation gas cost (small): ' + tx.receipt.gasUsed);
      }

      async function printGasCostLarge(seconds) {
        const tx = await contract.getCompoundedInterest(tokens2, percent, seconds);
        console.log('\tInterestCalculation gas cost (large): ' + tx.receipt.gasUsed);
      }

      await printGasCost(new BigNumber(BIGNUMBERS.ONE_DAY_IN_SECONDS));
      await printGasCost(new BigNumber(BIGNUMBERS.ONE_DAY_IN_SECONDS * 5));
      await printGasCost(new BigNumber(BIGNUMBERS.ONE_DAY_IN_SECONDS* 364));
      await printGasCost(new BigNumber(BIGNUMBERS.ONE_DAY_IN_SECONDS * 365));
      await printGasCostLarge(new BigNumber(BIGNUMBERS.ONE_DAY_IN_SECONDS * 1));
      await printGasCostLarge(new BigNumber(BIGNUMBERS.ONE_DAY_IN_SECONDS * 365));
    });
  });
});
