const BigNumber = require('bignumber.js');

const TOKENIZED_POSITION_STATE = {
  UNINITIALIZED: new BigNumber(0),
  OPEN: new BigNumber(1),
  CLOSED: new BigNumber(2)
};

async function getERC20PositionConstants(erc20Contract) {
  const [
    DYDX_MARGIN,
    POSITION_ID,
    state,
    INITIAL_TOKEN_HOLDER,
    heldToken,
    totalSupply
  ] = await Promise.all([
    erc20Contract.DYDX_MARGIN.call(),
    erc20Contract.POSITION_ID.call(),
    erc20Contract.state.call(),
    erc20Contract.INITIAL_TOKEN_HOLDER.call(),
    erc20Contract.heldToken.call(),
    erc20Contract.totalSupply.call(),
  ]);

  return {
    DYDX_MARGIN,
    POSITION_ID,
    state,
    INITIAL_TOKEN_HOLDER,
    heldToken,
    totalSupply
  };
}

module.exports = {
  TOKENIZED_POSITION_STATE,
  getERC20PositionConstants
};
