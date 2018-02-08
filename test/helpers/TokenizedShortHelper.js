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
    PROXY,
    shortId,
    state,
    name,
    symbol,
    initialTokenHolder,
    redeemed,
    baseToken
  ] = await Promise.all([
    tokenizedShort.SHORT_SELL.call(),
    tokenizedShort.PROXY.call(),
    tokenizedShort.shortId.call(),
    tokenizedShort.state.call(),
    tokenizedShort.name.call(),
    tokenizedShort.symbol.call(),
    tokenizedShort.initialTokenHolder.call(),
    tokenizedShort.redeemed.call(),
    tokenizedShort.baseToken.call()
  ]);
  return {
    SHORT_SELL,
    PROXY,
    shortId,
    state,
    name,
    symbol,
    initialTokenHolder,
    redeemed,
    baseToken
  };
}

module.exports = {
  TOKENIZED_SHORT_STATE,
  getTokenizedShortConstants
};
