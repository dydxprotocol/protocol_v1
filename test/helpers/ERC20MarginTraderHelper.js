/*global*/

const BigNumber = require('bignumber.js');

const TOKENIZED_POSITION_STATE = {
  UNINITIALIZED: new BigNumber(0),
  OPEN: new BigNumber(1),
  CLOSED: new BigNumber(2)
};

async function getERC20MarginTraderConstants(ERC20MarginTrader) {
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
    ERC20MarginTrader.MARGIN.call(),
    ERC20MarginTrader.MARGIN_ID.call(),
    ERC20MarginTrader.state.call(),
    ERC20MarginTrader.name.call(),
    ERC20MarginTrader.symbol.call(),
    ERC20MarginTrader.INITIAL_TOKEN_HOLDER.call(),
    ERC20MarginTrader.quoteToken.call(),
    ERC20MarginTrader.totalSupply.call(),
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
  getERC20MarginTraderConstants
};
