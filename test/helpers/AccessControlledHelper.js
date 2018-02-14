const expect = require('chai').expect;

const { getBlockNumber, getBlockTimestamp } = require("./NodeHelper");

module.exports = {
  validateStaticAccessControlledConstants
};

/**
 * Validates that the constructor for any contract of type StaticAccessControlled has correctly set
 * gracePeriodExpiration
 * @param  {Contract} contract             the deployed contract that extends AccessControlled
 * @param  {BigNumber} expectedGracePeriod the expected value of gracePeriodExpiration
 * @return {bool}                          returns true unless it throws an error due to expect()
 */
async function validateStaticAccessControlledConstants(
  contract,
  expectedGracePeriod) {
  const contractGracePeriodExpiration = await contract.gracePeriodExpiration.call();

  const blockNumber = await getBlockNumber(contract.transactionHash);
  const creationTimeStamp = await getBlockTimestamp(blockNumber);
  const expectedGracePeriodExpiration = expectedGracePeriod.plus(creationTimeStamp);
  expect(contractGracePeriodExpiration.equals(expectedGracePeriodExpiration)).to.be.true;
  return true;
}
