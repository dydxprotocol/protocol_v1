/*global artifacts, contract, describe, before, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const TestFractionMath = artifacts.require("TestFractionMath");
const { BIGNUMBERS } = require('../helpers/Constants');

contract('InterestHelper', function(_accounts) {
  let contract;

  before('', async () => {
    contract = await TestFractionMath.new();
  });

  describe('#add', () => {
    it('succeeds for addition overflow', async () => {
      const bn = BIGNUMBERS.ONES_127;
      const [num, den] = await contract.add(bn,bn,bn,bn);
      expect(num).to.be.bignumber.equal(den.times(2));
    });
  });
});
