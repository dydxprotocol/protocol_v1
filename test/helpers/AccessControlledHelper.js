import chai from 'chai';
import { getBlockNumber, getBlockTimestamp } from './NodeHelper';

const { expect } = chai;
chai.use(require('chai-bignumber')());

/**
 * Validates that the constructor for any contract of type StaticAccessControlled has correctly set
 * gracePeriodExpiration
 * @param  {Contract} contract             the deployed contract that extends AccessControlled
 * @param  {BigNumber} expectedGracePeriod the expected value of gracePeriodExpiration
 * @return {bool}                          returns true unless it throws an error due to expect()
 */
export async function validateStaticAccessControlledConstants(
  contract,
  expectedGracePeriod,
) {
  const contractGracePeriodExpiration = await contract.GRACE_PERIOD_EXPIRATION.call();

  const blockNumber = await getBlockNumber(contract.transactionHash);
  const creationTimeStamp = await getBlockTimestamp(blockNumber);
  const expectedGracePeriodExpiration = expectedGracePeriod.plus(creationTimeStamp);
  expect(contractGracePeriodExpiration).to.be.bignumber.equal(expectedGracePeriodExpiration);
  return true;
}
