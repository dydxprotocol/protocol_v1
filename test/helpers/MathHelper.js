/*global web3*/

const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const web3Instance = new Web3(web3.currentProvider);

function getPartialAmount(
  numerator,
  denominator,
  target,
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

module.exports = {
  uint256,
  getPartialAmount,
}
