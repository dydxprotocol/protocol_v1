/*global*/

const BigNumber = require('bignumber.js');

const TOKENIZED_SHORT_STATE = {
  UNINITIALIZED: new BigNumber(0),
  OPEN: new BigNumber(1),
  CLOSED: new BigNumber(2)
};

async function getERC20ShortConstants(ERC20Short) {
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
    ERC20Short.SHORT_SELL.call(),
    ERC20Short.SHORT_ID.call(),
    ERC20Short.state.call(),
    ERC20Short.name.call(),
    ERC20Short.symbol.call(),
    ERC20Short.initialTokenHolder.call(),
    ERC20Short.baseToken.call(),
    ERC20Short.totalSupply.call(),
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
  getERC20ShortConstants
};
