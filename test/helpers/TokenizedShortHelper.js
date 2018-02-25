/*global*/

const BigNumber = require('bignumber.js');

const TOKENIZED_SHORT_STATE = {
  UNINITIALIZED: new BigNumber(0),
  OPEN: new BigNumber(1),
  CLOSED: new BigNumber(2)
};

async function getTokenizedShortConstants(tokenizedShort) {
  const [
    SHORT_SELL,
    shortId,
    state,
    name,
    symbol,
    initialTokenHolder,
    baseToken,
    totalSupply
  ] = await Promise.all([
    tokenizedShort.SHORT_SELL.call(),
    tokenizedShort.shortId.call(),
    tokenizedShort.state.call(),
    tokenizedShort.name.call(),
    tokenizedShort.symbol.call(),
    tokenizedShort.initialTokenHolder.call(),
    tokenizedShort.baseToken.call(),
    tokenizedShort.totalSupply.call(),
  ]);
  return {
    SHORT_SELL,
    shortId,
    state,
    name,
    symbol,
    initialTokenHolder,
    baseToken,
    totalSupply
  };
}

module.exports = {
  TOKENIZED_SHORT_STATE,
  getTokenizedShortConstants
};
