const Web3 = require('web3');
const chai = require('chai');
const expect = chai.expect;
const BN = require('bignumber.js');
const web3Instance = new Web3(web3.currentProvider);


function getPartialAmount(
  numerator,
  denominator,
  target = 1,
  roundsUp = false
) {
  if (!(numerator instanceof BN)) {
    numerator = new BN(numerator);
  }
  if (roundsUp) {
    return numerator.times(target).plus(denominator).minus(1).div(denominator).floor();
  } else {
    return numerator.times(target).div(denominator).floor();
  }
}

function uint256(positionId) {
  return new BN(web3Instance.utils.toBN(positionId));
}

function expectWithinError(numA, numB, error) {
  numA = new BN(numA);
  numB = new BN(numB);
  expect(numA).to.be.bignumber.lte(numB.plus(error));
  expect(numB).to.be.bignumber.lte(numA.plus(error));
}

module.exports = {
  uint256,
  getPartialAmount,
  expectWithinError
}
