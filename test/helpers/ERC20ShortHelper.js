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
    SHORT_ID,
    state,
    name,
    symbol,
    INITIAL_TOKEN_HOLDER,
    baseToken,
    totalSupply
  ] = await Promise.all([
    ERC20Short.SHORT_SELL.call(),
    ERC20Short.SHORT_ID.call(),
    ERC20Short.state.call(),
    ERC20Short.name.call(),
    ERC20Short.symbol.call(),
    ERC20Short.INITIAL_TOKEN_HOLDER.call(),
    ERC20Short.baseToken.call(),
    ERC20Short.totalSupply.call(),
  ]);
  return {
    SHORT_SELL,
    SHORT_ID,
    state,
    name,
    symbol,
    INITIAL_TOKEN_HOLDER,
    baseToken,
    totalSupply
  };
}

module.exports = {
  TOKENIZED_SHORT_STATE,
  getERC20ShortConstants
};
