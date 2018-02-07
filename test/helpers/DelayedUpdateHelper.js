const expect = require('chai').expect;

module.exports = {
  validateDelayedUpdateConstants
};

/**
 * Validates that the constructor for any contract of type DelayedUpdate has correctly set
 * updateDelay and updateExpiration
 * @param  {contract} contract            the deployed contract that extends DelayedUpdate
 * @param  {BigNumber} expectedDelay      the expected value of updateDelay
 * @param  {BigNumber} expectedExpiration the expected value of updateExpiration
 * @return {bool}                         returns true unless it throws an error due to expect()
 */
async function validateDelayedUpdateConstants(
  contract,
  expectedDelay,
  expectedExpiration) {
  const [
    contractDelay,
    contractExpiration
  ] = await Promise.all([
    contract.updateDelay.call(),
    contract.updateExpiration.call()
  ]);

  expect(contractDelay.equals(expectedDelay)).to.be.true;
  expect(contractExpiration.equals(expectedExpiration)).to.be.true;
  return true;
}
