import Web3 from 'web3';
import BigNumber from 'bignumber.js';
import expect from './expect';

const web3Instance = new Web3(web3.currentProvider);

export function getPartialAmount(
  numerator,
  denominator,
  target = 1,
  roundsUp = false,
) {
  if (!(numerator instanceof BigNumber)) {
    numerator = new BigNumber(numerator);
  }
  if (roundsUp) {
    return numerator
      .times(target)
      .plus(denominator)
      .minus(1)
      .div(denominator)
      .floor();
  }

  return numerator
    .times(target)
    .div(denominator)
    .floor();
}

export function uint256(positionId) {
  return new BigNumber(web3Instance.utils.toBN(positionId));
}

export function expectWithinError(numA, numB, error) {
  numA = new BigNumber(numA);
  numB = new BigNumber(numB);
  expect(numA).to.be.bignumber.lte(numB.plus(error));
  expect(numB).to.be.bignumber.lte(numA.plus(error));
}
