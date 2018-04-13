/*global*/

const BigNumber = require('bignumber.js');

const TOKENIZED_SHORT_STATE = {
  UNINITIALIZED: new BigNumber(0),
  OPEN: new BigNumber(1),
  CLOSED: new BigNumber(2)
};

async function getERC20ShortConstants(ERC20Short) {
  const [
    MARGIN,
    MARGIN_ID,
    state,
    name,
    symbol,
    INITIAL_TOKEN_HOLDER,
    quoteToken,
    totalSupply
  ] = await Promise.all([
    ERC20Short.MARGIN.call(),
    ERC20Short.MARGIN_ID.call(),
    ERC20Short.state.call(),
    ERC20Short.name.call(),
    ERC20Short.symbol.call(),
    ERC20Short.INITIAL_TOKEN_HOLDER.call(),
    ERC20Short.quoteToken.call(),
    ERC20Short.totalSupply.call(),
  ]);
  return {
    MARGIN,
    MARGIN_ID,
    state,
    name,
    symbol,
    INITIAL_TOKEN_HOLDER,
    quoteToken,
    totalSupply
  };
}

module.exports = {
  TOKENIZED_SHORT_STATE,
  getERC20ShortConstants
};
