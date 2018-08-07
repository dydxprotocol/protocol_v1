const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const { BIGNUMBERS } = require('../../helpers/Constants');
const { expectWithinError } = require('../../helpers/MathHelper');

contract('InterestHelper', function(_accounts) {
  let contract;

  describe('#getCompoundedInterest', () => {
    before('', async () => {
      await TestInterestImpl.link('InterestImpl', InterestImpl.address);
      contract = await TestInterestImpl.new();
    });

    it('calculates 100% continuously compounded interest correctly', async () => {
      let result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('100e6'), // annual percent
        BIGNUMBERS.ONE_YEAR_IN_SECONDS // time
      );
      expect(result).to.be.bignumber.equal('2718281828459045236'); // 1e18 * E^(100%)

      result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('10e6'), // annual percent
        BIGNUMBERS.ONE_YEAR_IN_SECONDS.times(10) // time
      );
      expect(result).to.be.bignumber.equal('2718281828459045236'); // 1e18 * E^(100%)
    });

    it('calculates e^X correctly for every integer', async () => {
      const maxInt = 80;
      const baseAmount = new BigNumber('1e18');
      const hundredPercent = new BigNumber('100e6');
      for (let i = 0; i <= maxInt; i++) {
        let e = Math.exp(i).toString();
        let result = await contract.getCompoundedInterest.call(
          baseAmount,
          hundredPercent,
          BIGNUMBERS.ONE_YEAR_IN_SECONDS.times(i)
        );
        expectWithinError(result.div(baseAmount.times(e)), 1, '0.0001'); // within 0.01% error
      }
    });

    it('calculates just below 100% correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('99999999'), // annual percent
        BIGNUMBERS.ONE_YEAR_IN_SECONDS // time
      );
      expect(result).to.be.bignumber.equal('2718281801276227087'); // Calculated using WolframAlpha
    });

    it('calculates < 100% correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('5e6'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(3) // time
      );
      expect(result).to.be.bignumber.equal('1000411043359288829'); // 1e18 * E^(5% * 3/365)
    });

    it('calculates > 100% correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e18'), // total
        new BigNumber('100e6'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(368) // time
      );
      expect(result).to.be.bignumber.equal('2740715939567547185'); // 1e18 * E^(368/365)
    });

    it('calculates > 3200% correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1'), // total
        new BigNumber('3300e6'), // annual percent
        BIGNUMBERS.ONE_YEAR_IN_SECONDS // time
      );
      expect(result).to.be.bignumber.equal('214643579785917'); // 1 * E^(368/365)
    });

    it('calculates primes correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('100000037'), // total
        new BigNumber('100000007'), // annual percent
        new BigNumber('30000001') // time
      );
      expect(result).to.be.bignumber.equal('258905833'); // Calculated using WolframAlpha
    });

    it('calculates tokenAmount > 2**128 correctly for no interest', async () => {
      const lentAmount = new BigNumber('1e50');
      const result = await contract.getCompoundedInterest.call(
        lentAmount, // total
        0, // annual interest
        0 // time
      );
      expect(result).to.be.bignumber.equal(lentAmount);
    });

    it('test branch coverage (numerator times tokenAmount has 128 bits exactly)', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('4e38'), // total
        new BigNumber('5e6'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(3) // time
      );
      expect(result.dividedBy('4e20').toFixed(0, BigNumber.ROUND_CEIL))
        .to.be.bignumber.equal('1000411043359288829'); // 1e18 * E^(5% * 3/365)
    });

    it('calculates tokenAmount > 2**128 correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e40'), // total
        new BigNumber('5e6'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(3) // time
      );
      expect(result.dividedBy('1e22').toFixed(0, BigNumber.ROUND_CEIL))
        .to.be.bignumber.equal('1000411043359288829'); // 1e18 * E^(5% * 3/365)
    });

    it('calculates tokenAmount > 2**255 correctly', async () => {
      const result = await contract.getCompoundedInterest.call(
        new BigNumber('1e77'), // total
        new BigNumber('5e6'), // annual percent
        BIGNUMBERS.ONE_DAY_IN_SECONDS.times(3) // time
      );
      expect(result.dividedBy('1e59').toFixed(0, BigNumber.ROUND_CEIL))
        .to.be.bignumber.equal('1000411043359288829'); // 1e18 * E^(5% * 3/365)
    });
  });
});
