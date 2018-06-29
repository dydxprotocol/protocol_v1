const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const TestMath512 = artifacts.require("TestMath512");
const { BIGNUMBERS } = require('../helpers/Constants');
const { expectAssertFailure } = require('../helpers/ExpectHelper');

contract('InterestHelper', function(_accounts) {
  let contract;

  before('set up contract', async () => {
    contract = await TestMath512.new();
  });
});
