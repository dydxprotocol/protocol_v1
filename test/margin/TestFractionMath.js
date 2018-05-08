/*global artifacts, contract, describe, before, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const TestFractionMath = artifacts.require("TestFractionMath");
const { BIGNUMBERS } = require('../helpers/Constants');
const { expectAssertFailure } = require('../helpers/ExpectHelper');

const bn = BIGNUMBERS.ONES_127;

contract('FractionMath', function(_accounts) {
  let contract;

  before('deploy mock contract', async () => {
    contract = await TestFractionMath.new();
  });

  describe('#add', () => {
    it('succeeds for addition overflow', async () => {
      const [num, den] = await contract.add(bn, bn, bn, bn);
      expect(num).to.be.bignumber.equal(den.times(2));
    });
  });

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
});
