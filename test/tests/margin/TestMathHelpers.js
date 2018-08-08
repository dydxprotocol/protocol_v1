const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const TestMathHelpers = artifacts.require("TestMathHelpers");
const { BIGNUMBERS } = require('../../helpers/Constants');
const { expectAssertFailure } = require('../../helpers/ExpectHelper');

contract('InterestHelper', function(_accounts) {
  let contract;

  before('set up contract', async () => {
    contract = await TestMathHelpers.new();
  });

  describe('#getPartialAmount', () => {
    async function expectPartialAmount(num, den, tar, expected) {
      const [result1, result2] = await Promise.all([
        contract.getPartialAmount.call(num, den, tar),
        contract.getPartialAmount.call(tar, den, num),
      ]);
      expect(result1).to.be.bignumber.equal(expected);
      expect(result1).to.be.bignumber.equal(result2);
    }

    it('succeeds for most values', async () => {
      await Promise.all([
        expectPartialAmount(1, 1, 1, 1),
        expectPartialAmount(1, 2, 2, 1),
        expectPartialAmount(1, 2, 1, 0),
        expectPartialAmount(3, 5, 2, 1),
        expectPartialAmount(3, 5, 6, 3),
        expectPartialAmount(3, 5, 7, 4),
        expectPartialAmount(2, 3, 6, 4),
        expectPartialAmount(15, 1, 0, 0),
      ]);
    });

    it('fails for zero denominator', async () => {
      await expectAssertFailure(
        expectPartialAmount(1, 0, 1, 0)
      );
    });
  });

  describe('#getPartialAmountRoundedUp', () => {
    async function expectPartialAmountRoundedUp(num, den, tar, expected) {
      const [result1, result2] = await Promise.all([
        contract.getPartialAmountRoundedUp.call(num, den, tar),
        contract.getPartialAmountRoundedUp.call(tar, den, num),
      ]);
      expect(result1).to.be.bignumber.equal(expected);
      expect(result1).to.be.bignumber.equal(result2);
    }

    it('succeeds for most values', async () => {
      await Promise.all([
        expectPartialAmountRoundedUp(1, 1, 1, 1),
        expectPartialAmountRoundedUp(1, 2, 2, 1),
        expectPartialAmountRoundedUp(1, 2, 1, 1),
        expectPartialAmountRoundedUp(3, 5, 2, 2),
        expectPartialAmountRoundedUp(3, 5, 6, 4),
        expectPartialAmountRoundedUp(3, 5, 7, 5),
        expectPartialAmountRoundedUp(2, 3, 6, 4),
        expectPartialAmountRoundedUp(15, 1, 0, 0),
      ]);
    });

    it('fails for zero denominator', async () => {
      await expectAssertFailure(
        expectPartialAmountRoundedUp(1, 0, 1, 0)
      );
    });
  });

  describe('#divisionRoundedUp', () => {
    async function expectDivisionRoundedUp(num, den, expected) {
      let result = await contract.divisionRoundedUp.call(num, den);
      expect(result).to.be.bignumber.equal(expected);
    }

    it('succeeds for most values', async () => {
      await Promise.all([
        expectDivisionRoundedUp(0, 1, 0),
        expectDivisionRoundedUp(1, 1, 1),
        expectDivisionRoundedUp(1, 2, 1),
        expectDivisionRoundedUp(45, 44, 2),
        expectDivisionRoundedUp(43, 44, 1),
        expectDivisionRoundedUp(0, 23, 0),
        expectDivisionRoundedUp(1, 23, 1),
        expectDivisionRoundedUp(63, 16, 4),
        expectDivisionRoundedUp(63, 15, 5),
      ]);
    });

    it('fails for zero denominator', async () => {
      await expectAssertFailure(
        expectDivisionRoundedUp(1, 0, 0)
      );
    });
  });

  describe('#maxUint256', () => {
    it('gives the expected value', async () => {
      const result = await contract.maxUint256.call();
      expect(result).to.be.bignumber.equal(BIGNUMBERS.MAX_UINT256);
    });
  });

  describe('#getNumBits', () => {
    async function expectBits(num, bits) {
      let result = await contract.getNumBits.call(num);
      expect(result).to.be.bignumber.equal(bits);
    }

    it('works for a few different values', async () => {
      await Promise.all([
        expectBits(3, 2),
        expectBits(5, 3),
        expectBits(7, 3),
        expectBits(11, 4),
        expectBits(12, 4),
        expectBits(15, 4)
      ]);
    });

    it('works for 0-256 bits', async () => {
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
});
