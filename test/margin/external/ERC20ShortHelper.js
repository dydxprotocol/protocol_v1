/*global*/

const BigNumber = require('bignumber.js');

const TOKENIZED_POSITION_STATE = {
  UNINITIALIZED: new BigNumber(0),
  OPEN: new BigNumber(1),
  CLOSED: new BigNumber(2)
};

async function getERC20ShortConstants(ERC20Short) {
  const [
    DYDX_MARGIN,
    POSITION_ID,
    state,
    name,
    symbol,
    INITIAL_TOKEN_HOLDER,
    heldToken,
    totalSupply
  ] = await Promise.all([
    ERC20Short.DYDX_MARGIN.call(),
    ERC20Short.POSITION_ID.call(),
    ERC20Short.state.call(),
    ERC20Short.name.call(),
    ERC20Short.symbol.call(),
    ERC20Short.INITIAL_TOKEN_HOLDER.call(),
    ERC20Short.heldToken.call(),
    ERC20Short.totalSupply.call(),
  ]);
  return {
    DYDX_MARGIN,
    POSITION_ID,
    state,
    name,
    symbol,
    INITIAL_TOKEN_HOLDER,
    heldToken,
    totalSupply
  };
}

module.exports = {
  TOKENIZED_POSITION_STATE,
  getERC20ShortConstants
};
