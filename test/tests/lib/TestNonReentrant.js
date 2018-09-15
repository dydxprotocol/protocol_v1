const TestNonReentrant = artifacts.require("TestNonReentrant");
const TestReenterer = artifacts.require("TestReenterer");
const { expectThrow } = require('../../helpers/ExpectHelper');

contract('TestNonReentrant', function() {
  describe('#nonReentrant', () => {
    it('prevents reentrancy', async() => {
      const [
        contract,
        reenterer
      ] = await Promise.all([
        TestNonReentrant.new(),
        TestReenterer.new()
      ]);

      await expectThrow(
        contract.function1(reenterer.address)
      );
    });
  });
});
