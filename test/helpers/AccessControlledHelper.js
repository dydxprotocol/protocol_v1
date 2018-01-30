/*global web3*/

const expect = require('chai').expect;

const { getBlockTimestamp } = require("./NodeHelper");

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

  expect(contractDelay.equals(expectedAccessDelay)).to.be.true;
  const creationTimeStamp = await getBlockTimestamp(contract.contract._eth.blockNumber);
  const expectedGracePeriodExpiration = expectedGracePeriod.plus(creationTimeStamp);
  expect(contractGracePeriodExpiration.equals(expectedGracePeriodExpiration)).to.be.true;
  return true;
}

module.exports = {
  validateAccessControlledConstants
};
