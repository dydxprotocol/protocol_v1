/*global artifacts, contract, describe, before, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const { BIGNUMBERS } = require('../helpers/Constants');

contract('InterestHelper', function(_accounts) {
  let contract;

  describe('#getNumBits', () => {
    before('', async () => {
      await TestInterestImpl.link('InterestImpl', InterestImpl.address);
      contract = await TestInterestImpl.new();
    });

    it('works for 0 through 256', async () => {
      let result = await contract.getNumBits.call(BIGNUMBERS.ZERO);
      expect(result).to.be.bignumber.equal(0);

      let n = new BigNumber(1);
      for(let i = 0; i < 256; i++) {
        let result = await contract.getNumBits.call(n);
        expect(result).to.be.bignumber.equal(i + 1);
        n = n.times(2);
      }
    });
  });

  describe('#getCompoundedInterest', () => {
    before('', async () => {
      await TestInterestImpl.link('InterestImpl', InterestImpl.address);
      contract = await TestInterestImpl.new();
    });

    it('calculates 100% continuously compounded interest correctly', async () => {
      let result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('1e18'), // annual percent
        BIGNUMBERS.ONE_YEAR_IN_SECONDS, // time
        new BigNumber(0)); // time rounding
      expect(result).to.be.bignumber.equal('2718281828459045236'); // 1e18 + E^(100%)

      result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('1e17'), // annual percent
        BIGNUMBERS.ONE_YEAR_IN_SECONDS.times(10), // time
        new BigNumber(0)); // time rounding
      expect(result).to.be.bignumber.equal('2718281828459045236'); // 1e18 + E^(100%)
    });

    it('calculates < 100% correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('5e16'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(3), // time
        new BigNumber(0)); // time rounding
      expect(result).to.be.bignumber.equal('1000411043359288829'); // 1e18 + E^(5% * 3/365)
    });

    it('calculates > 100% correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('1e18'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(368), // time
        new BigNumber(0)); // time rounding
      expect(result).to.be.bignumber.equal('2740715939567547185'); // 1e18 + E^(368/365)
    });

    it('calculates > 3200% correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1'), // total
        new BigNumber('33e18'), // annual percent
        BIGNUMBERS.ONE_YEAR_IN_SECONDS, // time
        new BigNumber(0)); // time rounding
      expect(result).to.be.bignumber.equal('214643579785917'); // 1 + E^(368/365)
    });

    it('does timestep rounding correctly', async () => {
      // Round 2.5 days up to the nearest day
      let result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('5e16'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(2.5), // time
        BIGNUMBERS.ONE_DAY_IN_SECONDS); // time rounding
      expect(result).to.be.bignumber.equal('1000411043359288829'); // 1e18 + E^(5% * 3/365)

      // Round 3 days up to the nearest year
      result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('1e18'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(3), // time
        BIGNUMBERS.ONE_YEAR_IN_SECONDS); // time rounding
      expect(result).to.be.bignumber.equal('2718281828459045236'); // 1e18 + E^(100%)
    });

    it('calculates tokenAmount > 2**128 correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e40'), // total
        new BigNumber('5e16'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(3), // time
        new BigNumber(0)); // time rounding
      expect(result.dividedBy('1e22').toFixed(0, BigNumber.ROUND_CEIL))
        .to.be.bignumber.equal('1000411043359288829'); // 1e18 + E^(5% * 3/365)
    });

    it('calculates tokenAmount > 2**255 correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e77'), // total
        new BigNumber('5e16'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(3), // time
        new BigNumber(0)); // time rounding
      expect(result.dividedBy('1e59').toFixed(0, BigNumber.ROUND_CEIL))
        .to.be.bignumber.equal('1000411043359288829'); // 1e18 + E^(5% * 3/365)
    });
  });
});
