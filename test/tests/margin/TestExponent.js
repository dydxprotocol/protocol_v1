const TestExponent = artifacts.require("TestExponent");
const { expectThrow } = require('../../helpers/ExpectHelper');

contract('InterestHelper', function(_accounts) {
  let contract;

  describe('#exp', () => {
    before('deploy contract', async () => {
      contract = await TestExponent.new();
    });

    it('fails for too-large precomputePrecision', async () => {
      await contract.exp(1, 2, 14, 6);
      await contract.exp(1, 2, 32, 6);
      await expectThrow(contract.exp(1, 2, 33, 6));
      await expectThrow(contract.exp(1, 2, 34, 6));
    });
  });
});
