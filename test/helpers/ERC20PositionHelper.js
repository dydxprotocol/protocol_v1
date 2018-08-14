const { createOpenTx } = require('./MarginHelper');
const { BIGNUMBERS } = require('./Constants');
const BigNumber = require('bignumber.js');
const { issueAndSetAllowance } = require('./TokenHelper');

const Margin = artifacts.require('Margin');
const ERC20ShortCreator = artifacts.require('ERC20ShortCreator');
const BucketLender = artifacts.require('BucketLender');
const TokenProxy = artifacts.require('TokenProxy');
const TestToken = artifacts.require('TestToken');
const WETH9 = artifacts.require("WETH9");
const EthWrapperForBucketLender = artifacts.require("EthWrapperForBucketLender");

const DEPOSIT = new BigNumber('500e18');
const PRINCIPAL = new BigNumber('1e18');

async function createShortToken(
  accounts,
  {
    nonce,
    interestPeriod
  }
) {
  const trader = accounts[8];

  const [openTx, dydxMargin] = await Promise.all([
    createOpenTx(
      accounts,
      {
        positionOwner: ERC20ShortCreator.address,
        interestPeriod,
        trader,
        nonce
      }
    ),
    Margin.deployed()
  ]);

  const [bucketLender, ethWrapper, heldToken] = await Promise.all([
    createBucketLender(openTx),
    EthWrapperForBucketLender.deployed(),
    TestToken.at(openTx.heldToken),
  ]);


  await Promise.all([
    ethWrapper.depositEth(
      bucketLender.address,
      trader,
      {
        value: new BigNumber('10').times(PRINCIPAL),
        from: trader
      },
    ),
    issueAndSetAllowance(heldToken, trader, DEPOSIT, TokenProxy.address)
  ]);

  await dydxMargin.openWithoutCounterparty(
    [
      ERC20ShortCreator.address,
      WETH9.address,
      openTx.heldToken,
      bucketLender.address
    ],
    [
      PRINCIPAL,
      DEPOSIT,
      nonce
    ],
    [
      openTx.loanOffering.callTimeLimit,
      openTx.loanOffering.maxDuration,
      openTx.loanOffering.rates.interestRate,
      openTx.loanOffering.rates.interestPeriod,
    ],
    { from: trader }
  );

  return openTx;
}

async function createBucketLender(openTx) {
  const bucketLender = await BucketLender.new(
    Margin.address,
    openTx.id,
    openTx.heldToken,
    WETH9.address,
    [
      BIGNUMBERS.ONE_DAY_IN_SECONDS,
      openTx.loanOffering.rates.interestRate,
      openTx.loanOffering.rates.interestPeriod,
      openTx.loanOffering.maxDuration,
      openTx.loanOffering.callTimeLimit,
      DEPOSIT.div(new BigNumber('1e18')), // MIN_HELD_TOKEN_NUMERATOR,
      PRINCIPAL.div(new BigNumber('1e18')), // MIN_HELD_TOKEN_DENOMINATOR,
    ],
    [] // trusted margin-callers
  );

  return bucketLender;
}

module.exports = {
  createShortToken
};
