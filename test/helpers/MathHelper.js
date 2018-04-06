const BigNumber = require('bignumber.js');

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

module.exports = {
  getPartialAmount,
}
