/*global artifacts, contract, describe, before, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const { getGasCost } = require('../helpers/NodeHelper');

contract('InterestHelper', function(accounts) {
  let contract;
  let ONE_DAY = 60*60*24;

  describe('#getCompoundedInterest', () => {
    before('', async () => {
      await TestInterestImpl.link('InterestImpl', InterestImpl.address);
      contract = await TestInterestImpl.new();
    });

    it('calculates 100% continuously compounded interest correctly', async () => {
      let result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('1e18'), // annual percent
        new BigNumber(60 * 60 * 24 * 365), // time
        new BigNumber(0)); // time rounding
      expect(result).to.be.bignumber.equal('2718281828459045236'); // E^(100%)

      result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('1e17'), // annual percent
        new BigNumber(60 * 60 * 24 * 365 * 10), // time
        new BigNumber(0)); // time rounding
      expect(result).to.be.bignumber.equal('2718281828459045236'); // E^(100%)
    });

    it('calculates < 100% correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('5e16'), // annual percent
        new BigNumber(60 * 60 * 24 * 3), // time
        new BigNumber(0)); // time rounding
      expect(result).to.be.bignumber.equal('1000411043359288829'); // E^(5% * 3/365)
    });

    it('calculates > 100% correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('1e18'), // annual percent
        new BigNumber(60 * 60 * 24 * 368), // time
        new BigNumber(0)); // time rounding
      expect(result).to.be.bignumber.equal('2740715939567547185'); // E^(368/365)
    });

    it('calculates > 3200% correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1'), // total
        new BigNumber('33e18'), // annual percent
        new BigNumber(60 * 60 * 24 * 365), // time
        new BigNumber(0)); // time rounding
      expect(result).to.be.bignumber.equal('214643579785917'); // E^(368/365)
    });

    it('does timestep rounding correctly', async () => {
      // Round 2.5 days up to the nearest day
      let result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('5e16'), // annual percent
        new BigNumber(60 * 60 * 24 * 2.5), // time
        new BigNumber(60 * 60 * 24)); // time rounding
      expect(result).to.be.bignumber.equal('1000411043359288829'); // E^(5% * 3/365)

      // Round 3 days up to the nearest year
      result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('1e18'), // annual percent
        new BigNumber(60 * 60 * 24 * 3), // time
        new BigNumber(60 * 60 * 24 * 365)); // time rounding
      expect(result).to.be.bignumber.equal('2718281828459045236'); // E^(100%)
    });

    it('crashes for too-large of numbers', async () => {
      //TODO(brendanchou)
    });
  });

  describe('#getInverseCompoundedInterest', () => {
    //TODO(brendanchou)
  });
});
