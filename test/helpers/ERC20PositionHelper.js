const { createOpenTx } = require('./MarginHelper');
const { BIGNUMBERS } = require('./Constants');
const BigNumber = require('bignumber.js');
const { issueAndSetAllowance } = require('./TokenHelper');

const Margin = artifacts.require('Margin');
const ERC20ShortFactory = artifacts.require('ERC20ShortFactory');
const BucketLender = artifacts.require('BucketLender');
const TokenProxy = artifacts.require('TokenProxy');
const WETH9 = artifacts.require("WETH9");
const EthWrapperForBucketLender = artifacts.require("EthWrapperForBucketLender");
const { ADDRESSES } = require('./Constants');
const { createSignedOrder } = require('./ZeroExHelper');
const HeldToken = artifacts.require("TokenA");
const ZeroExProxy = artifacts.require('ZeroExProxy');

BigNumber.config({
  EXPONENTIAL_AT: 1000,
});

const DEPOSIT = new BigNumber('500e18');
const SELL_PRICE = new BigNumber('3018104e14');  // 301.8104
const BUY_PRICE = new BigNumber('2991231e14'); // 299.1231
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
        positionOwner: ERC20ShortFactory.address,
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
    HeldToken.deployed(),
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
      ERC20ShortFactory.address,
      WETH9.address,
      HeldToken.address,
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

async function createBuyOrderForToken(accounts) {
  const [heldToken, order] = await Promise.all([
    HeldToken.deployed(),
    createSignedOrder(
      accounts,
      {
        salt: 7294234423,
        feeRecipient: ADDRESSES.ZERO,
        makerTokenAddress: HeldToken.address,
        makerTokenAmount: new BigNumber('10').times(BUY_PRICE),
        takerTokenAddress: WETH9.address,
        takerTokenAmount: new BigNumber('10').times(PRINCIPAL),
      },
    ),
  ]);

  await issueAndSetAllowance(
    heldToken,
    order.maker,
    order.makerTokenAmount,
    ZeroExProxy.address,
  );

  return order;
}

async function createSellOrderForToken(accounts) {
  const [weth, order] = await Promise.all([
    WETH9.deployed(),
    createSignedOrder(
      accounts,
      {
        salt: 7294234423,
        feeRecipient: ADDRESSES.ZERO,
        makerTokenAddress: WETH9.address,
        makerTokenAmount: new BigNumber('10').times(PRINCIPAL),
        takerTokenAddress: HeldToken.address,
        takerTokenAmount: new BigNumber('10').times(SELL_PRICE),
      },
    ),
  ]);

  await Promise.all([
    weth.deposit({ value: order.makerTokenAmount, from: order.maker }),
    weth.approve(ZeroExProxy.address, order.makerTokenAmount, { from: order.maker })
  ]);

  return order;
}

async function createBucketLender(openTx) {
  const bucketLender = await BucketLender.new(
    Margin.address,
    openTx.id,
    HeldToken.address,
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
  createShortToken,
  createBuyOrderForToken,
  createSellOrderForToken,
};
