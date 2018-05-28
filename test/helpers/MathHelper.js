const Web3 = require('web3');
const chai = require('chai');
const expect = chai.expect;
const BigNumber = require('bignumber.js');
const web3Instance = new Web3(web3.currentProvider);


function getPartialAmount(
  numerator,
  denominator,
  target = 1,
  roundsUp = false
) {
  if (!(numerator instanceof BigNumber)) {
    numerator = new BigNumber(numerator);
  }
  if (roundsUp) {
    return numerator.times(target).plus(denominator).minus(1).div(denominator).floor();
  } else {
    return numerator.times(target).div(denominator).floor();
  }
}

function uint256(positionId) {
  return new BigNumber(web3Instance.utils.toBN(positionId));
}

function expectWithinError(numA, numB, error) {
  numA = new BigNumber(numA);
  numB = new BigNumber(numB);
  expect(numA).to.be.bignumber.lte(numB.plus(error));
  expect(numB).to.be.bignumber.lte(numA.plus(error));
}

module.exports = {
  uint256,
  getPartialAmount,
  expectWithinError
}
