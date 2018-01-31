const expect = require('chai').expect;

const { getBlockNumber, getBlockTimestamp } = require("./NodeHelper");

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

module.exports = {
  validateAccessControlledConstants
};
