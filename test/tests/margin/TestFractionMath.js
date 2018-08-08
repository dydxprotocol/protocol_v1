const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const TestFractionMath = artifacts.require("TestFractionMath");
const { BIGNUMBERS } = require('../../helpers/Constants');
const { expectAssertFailure } = require('../../helpers/ExpectHelper');

const bn = BIGNUMBERS.MAX_UINT128;

contract('FractionMath', function(_accounts) {
  let contract;

  before('deploy mock contract', async () => {
    contract = await TestFractionMath.new();
  });

  // ============ add ============

  describe('#add', () => {
    it('succeeds for addition overflow', async () => {
      const [num, den] = await contract.add(bn, bn, bn, bn);
      expect(num).to.be.bignumber.equal(den.times(2));
    });
  });

  // ============ sub1Over ============

  describe('#sub1Over', () => {
    async function sub1Over(num, den, d, numRes, denRes) {
      const result = await contract.sub1Over(num, den, d);
      expect(result[0]).to.be.bignumber.equal(numRes);
      expect(result[1]).to.be.bignumber.equal(denRes);
    }

    async function sub1OverThrow(num, den, d) {
      await expectAssertFailure(contract.sub1Over(num, den, d));
    }

    it('succeeds for sub1over', async () => {
      await Promise.all([
        sub1Over(3, 5, 2, 1, 10),
        sub1Over(2, 6, 3, 0, 6),
        sub1Over(1, 2, 4, 2, 8),
        sub1Over(1, 2, 3, 1, 6),
        sub1Over(1, 3, 5, 2, 15),
        sub1Over(bn, bn, 2, bn.div(2).floor(), bn),
      ]);
    });

    it('fails for bad values', async () => {
      await Promise.all([
        sub1OverThrow(1, 4, 2),
      ]);
    });
  });

  // ============ div ============

  describe('#div', () => {
    async function div(num, den, d, numRes, denRes) {
      const result = await contract.div(num, den, d);
      expect(result[0]).to.be.bignumber.equal(numRes);
      expect(result[1]).to.be.bignumber.equal(denRes);
    }

    async function divThrow(num, den, d) {
      await expectAssertFailure(contract.div(num, den, d));
    }

    it('succeeds for most values', async () => {
      await Promise.all([
        div(0, 2, 2, 0, 2),
        div(0, 1, 2, 0, 1),
        div(2, 2, 1, 2, 2),
        div(2, 4, 3, 2, 12),
        div(bn, bn, 2, bn.div(2).floor(), bn),
      ]);
    });

    it('fails for zero denominator', async () => {
      await Promise.all([
        divThrow(0, 0, 0),
        divThrow(1, 1, 0),
        divThrow(2, 2, 0),
        divThrow(1, 0, 1),
      ]);
    });
  });

  // ============ mul ============

  describe('#mul', () => {
    async function mul(num1, den1, num2, den2, numRes, denRes) {
      const result = await contract.mul(num1, den1, num2, den2);
      expect(result[0]).to.be.bignumber.equal(numRes);
      expect(result[1]).to.be.bignumber.equal(denRes);
    }

    async function mulThrow(num1, den1, num2, den2) {
      await expectAssertFailure(contract.mul(num1, den1, num2, den2));
    }

    it('succeeds for most values', async () => {
      await Promise.all([
        mul(1, 1, 1, 1, 1, 1),
        mul(1, 4, 3, 2, 3, 8),
        mul(2, 2, 2, 2, 4, 4),
        mul(bn, bn, bn, bn, bn, bn),
        mul(3, bn, bn, 3, bn, bn),
        mul(8, bn, bn, 8, bn, bn),
      ]);
    });

    it('fails for zero denominator', async () => {
      await Promise.all([
        mulThrow(2, 0, 2, 2),
        mulThrow(2, 2, 2, 0),
        mulThrow(bn, 1, bn, 1),
      ]);
    });
  });

  // ============ bound ============

  describe('#bound', () => {
    async function bound(num, den, numRes, denRes) {
      const result = await contract.bound(num, den);
      expect(result[0]).to.be.bignumber.equal(numRes);
      expect(result[1]).to.be.bignumber.equal(denRes);
    }

    async function boundThrow(num, den) {
      await expectAssertFailure(contract.bound(num, den));
    }

    it('succeeds for most values', async () => {
      await Promise.all([
        bound(0, 1, 0, 1),
        bound(1, 1, 1, 1),
        bound(2, 4, 2, 4),
        bound(bn, 1, bn, 1),
        bound(0, bn, 0, bn),
        bound(bn, bn, bn, bn),
        bound(bn.times(2), bn, bn, bn.div(2).floor()),
      ]);
    });

    it('fails for zero denominator', async () => {
      await Promise.all([
        boundThrow(0, 0),
        boundThrow(1, 0),
        boundThrow(bn, 0),
        boundThrow(bn.times(2), 1),
        boundThrow(bn.times(10), 2),
      ]);
    });
  });

  // ============ copy ============

  describe('#copy', () => {
    async function copy(num, den) {
      const result = await contract.copy(num, den);
      expect(result[0]).to.be.bignumber.equal(num);
      expect(result[1]).to.be.bignumber.equal(den);
    }

    async function copyThrow(num, den) {
      await expectAssertFailure(contract.copy(num, den));
    }

    it('succeeds for most values', async () => {
      await Promise.all([
        copy(0, 1),
        copy(0, 2),
        copy(1, 1),
        copy(2, 1),
        copy(1, 2),
        copy(0, bn),
        copy(bn, bn),
      ]);
    });

    it('fails for zero denominator', async () => {
      await Promise.all([
        copyThrow(0, 0),
        copyThrow(1, 0),
        copyThrow(2, 0),
      ]);
    });
  });
});
