const expect = require('chai').expect;

const { getBlockNumber, getBlockTimestamp } = require("./NodeHelper");

module.exports = {
  validateAccessControlledConstants
};

/**
 * Validates that the constructor for any contract of type AccessControlled has correctly set
 * accessDelay and gracePeriodExpiration
 * @param  {Contract} contract             the deployed contract that extends AccessControlled
 * @param  {BigNumber} expectedAccessDelay the expected value of accessDelay
 * @param  {BigNumber} expectedGracePeriod the expected value of gracePeriodExpiration
 * @return {bool}                          returns true unless it throws an error due to expect()
 */
async function validateAccessControlledConstants(
  contract,
  expectedAccessDelay,
  expectedGracePeriod) {
  const [
    contractDelay,
    contractGracePeriodExpiration
  ] = await Promise.all([
    contract.accessDelay.call(),
    contract.gracePeriodExpiration.call()
  ]);

  const blockNumber = await getBlockNumber(contract.transactionHash);
  const creationTimeStamp = await getBlockTimestamp(blockNumber);
  const expectedGracePeriodExpiration = expectedGracePeriod.plus(creationTimeStamp);
  expect(contractGracePeriodExpiration.equals(expectedGracePeriodExpiration)).to.be.true;
  expect(contractDelay.equals(expectedAccessDelay)).to.be.true;
  return true;
}
