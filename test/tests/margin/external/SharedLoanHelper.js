const BigNumber = require('bignumber.js');
const { ADDRESSES } = require('../../../helpers/Constants');

const SHARED_LOAN_STATE = {
  UNINITIALIZED: new BigNumber(0),
  OPEN: new BigNumber(1),
  CLOSED: new BigNumber(2)
};

async function getSharedLoanConstants(sharedLoanContract, initialLender) {
  const [
    MarginAddress,
    InitialLender,
    PositionId,
    State,
    OwedToken,
    HeldToken,
    TotalPrincipal,
    TotalPrincipalFullyWithdrawn,
    TotalOwedTokenWithdrawn,
    BalancesLender,
    BalancesZero,
    OwedTokenWithdrawnEarlyLender,
    OwedTokenWithdrawnEarlyZero,
  ] = await Promise.all([
    sharedLoanContract.DYDX_MARGIN.call(),
    sharedLoanContract.INITIAL_LENDER.call(),
    sharedLoanContract.POSITION_ID.call(),
    sharedLoanContract.state.call(),
    sharedLoanContract.owedToken.call(),
    sharedLoanContract.heldToken.call(),
    sharedLoanContract.totalPrincipal.call(),
    sharedLoanContract.totalPrincipalFullyWithdrawn.call(),
    sharedLoanContract.totalOwedTokenWithdrawn.call(),
    sharedLoanContract.balances.call(initialLender),
    sharedLoanContract.balances.call(ADDRESSES.ZERO),
    sharedLoanContract.owedTokenWithdrawnEarly.call(initialLender),
    sharedLoanContract.owedTokenWithdrawnEarly.call(ADDRESSES.ZERO)
  ]);
  return {
    MarginAddress,
    InitialLender,
    PositionId,
    State,
    OwedToken,
    HeldToken,
    TotalPrincipal,
    TotalPrincipalFullyWithdrawn,
    TotalOwedTokenWithdrawn,
    BalancesLender,
    BalancesZero,
    OwedTokenWithdrawnEarlyLender,
    OwedTokenWithdrawnEarlyZero,
  };
}

module.exports = {
  SHARED_LOAN_STATE,
  getSharedLoanConstants
};
