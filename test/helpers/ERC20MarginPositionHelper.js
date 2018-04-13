/*global*/

const BigNumber = require('bignumber.js');

const TOKENIZED_POSITION_STATE = {
  UNINITIALIZED: new BigNumber(0),
  OPEN: new BigNumber(1),
  CLOSED: new BigNumber(2)
};

async function getERC20MarginPositionConstants(ERC20MarginPosition) {
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
    ERC20MarginPosition.MARGIN.call(),
    ERC20MarginPosition.MARGIN_ID.call(),
    ERC20MarginPosition.state.call(),
    ERC20MarginPosition.name.call(),
    ERC20MarginPosition.symbol.call(),
    ERC20MarginPosition.INITIAL_TOKEN_HOLDER.call(),
    ERC20MarginPosition.quoteToken.call(),
    ERC20MarginPosition.totalSupply.call(),
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
  TOKENIZED_POSITION_STATE,
  getERC20MarginPositionConstants
};
