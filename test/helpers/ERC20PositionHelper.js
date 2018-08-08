const { createOpenTx, issueTokensAndSetAllowances, callOpenPosition } = require('./MarginHelper');
const { DEFAULT_SALT } = require('./Constants');

const Margin = artifacts.require('Margin');
const ERC20ShortCreator = artifacts.require('ERC20ShortCreator');
const SharedLoanCreator = artifacts.require('SharedLoanCreator');

async function createShortToken(
  accounts,
  {
    salt = DEFAULT_SALT,
    interestPeriod
  }
) {
  const [openTx, dydxMargin] = await Promise.all([
    createOpenTx(
      accounts,
      {
        salt,
        positionOwner: ERC20ShortCreator.address,
        loanOwner: SharedLoanCreator.address,
        interestPeriod
      }
    ),
    Margin.deployed()
  ]);

  await issueTokensAndSetAllowances(openTx);

  const response = await callOpenPosition(dydxMargin, openTx);

  openTx.id = response.id;
  openTx.response = response;
  return openTx;
}

module.exports = {
  createShortToken
};
