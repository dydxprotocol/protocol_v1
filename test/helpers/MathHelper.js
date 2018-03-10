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

function getQuotient3Over2(
  numerator1,
  numerator2,
  numerator3,
  denominator1,
  denominator2,
  roundsUp = false
) {
  if (!(numerator1 instanceof BigNumber)) {
    numerator1 = new BigNumber(numerator1);
  }
  const n = numerator1.times(numerator2).times(numerator3);
  const d = denominator1.times(denominator2);
  if (roundsUp) {
    const res = n.plus(d).minus(1).div(d).floor();
    return res;
  } else {
    return n.div(d).floor();
  }
}

module.exports = {
  getPartialAmount,
  getQuotient3Over2
}
