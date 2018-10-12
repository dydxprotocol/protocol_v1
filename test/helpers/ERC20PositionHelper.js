const { createOpenTx } = require('./MarginHelper');
const { BIGNUMBERS, ADDRESSES, POSITION_TYPE } = require('./Constants');
const BigNumber = require('bignumber.js');
const { issueAndSetAllowance } = require('./TokenHelper');
const { createSignedV1Order } = require('./ZeroExV1Helper');

const Margin = artifacts.require('Margin');
const DutchAuctionCloser = artifacts.require('DutchAuctionCloser');
const ERC20PositionWithdrawer = artifacts.require('ERC20PositionWithdrawer');
const ERC20Long = artifacts.require('ERC20Long');
const ERC20Short = artifacts.require('ERC20Short');
const BucketLender = artifacts.require('BucketLender');
const TokenProxy = artifacts.require('TokenProxy');
const WETH9 = artifacts.require("WETH9");
const BucketLenderProxy = artifacts.require("BucketLenderProxy");
const { ZeroExProxyV1 } = require('../contracts/ZeroExV1');

BigNumber.config({
  EXPONENTIAL_AT: 1000,
});
const SELL_PRICE = new BigNumber('3018104e14');  // 301.8104
const BUY_PRICE = new BigNumber('2991231e14'); // 299.1231

async function createMarginToken(
  accounts,
  {
    nonce,
    interestPeriod,
    trader,
    HeldToken,
    OwedToken,
    type,
    deposit,
    principal,
  }
) {
  trader = trader || accounts[8];

  const [openTx, dydxMargin] = await Promise.all([
    createOpenTx(
      accounts,
      {
        interestPeriod,
        trader,
        nonce,
        heldToken: HeldToken.address,
        owedToken: OwedToken.address,
      }
    ),
    Margin.deployed()
  ]);

  const
    [
      bucketLender,
      marginToken,
      owedToken,
      heldToken
    ] = await Promise.all([
      createBucketLender(openTx, trader, deposit, principal),
      createMarginTokenContract(openTx, type),
      OwedToken.deployed(),
      HeldToken.deployed(),
    ]);
  openTx.positionOwner = marginToken.address;

  await setupDepositAndPrincipal(
    accounts,
    {
      type,
      trader,
      heldToken,
      owedToken,
      bucketLender,
      deposit,
      principal,
    }
  );
  // openPositionWithoutCounterparty
  await dydxMargin.openWithoutCounterparty(
    [
      marginToken.address,
      OwedToken.address,
      HeldToken.address,
      bucketLender.address,
    ],
    [
      principal,
      deposit,
      nonce,
    ],
    [
      openTx.loanOffering.callTimeLimit,
      openTx.loanOffering.maxDuration,
      openTx.loanOffering.rates.interestRate,
      openTx.loanOffering.rates.interestPeriod,
    ],
    { from: trader },
  );
  return openTx;
}

async function setupDepositAndPrincipal(
  accounts,
  {
    type,
    trader,
    heldToken,
    owedToken,
    bucketLender,
    deposit,
    principal,
  }
) {
  if (type === POSITION_TYPE.SHORT) {
    const bucketLenderProxy = await BucketLenderProxy.deployed();
    await Promise.all([
      bucketLenderProxy.depositEth(
        bucketLender.address,
        {
          value: new BigNumber('10').times(principal),
          from: accounts[7],
        },
      ),
      issueAndSetAllowance(heldToken, trader, deposit, TokenProxy.address)
    ]);
    return;
  } else if (type === POSITION_TYPE.LONG) {
    await Promise.all([
      heldToken.deposit({ value: deposit, from: trader }),
      heldToken.approve(TokenProxy.address, deposit, { from: trader }),
      issueAndSetAllowance(
        owedToken,
        accounts[7],
        new BigNumber('10').times(principal),
        bucketLender.address,
      ),
    ]);
    await bucketLender.deposit(
      accounts[7],
      new BigNumber('10').times(principal),
      { from: accounts[7] },
    );
    return;
  }
}

async function createOrderForToken(
  accounts,
  MakerToken,
  TakerToken,
  makerTokenAmount,
  takerTokenAmount,
) {
  const [makerToken, order] = await Promise.all([
    MakerToken.deployed(),
    createSignedV1Order(
      accounts,
      {
        salt: 7294234423,
        feeRecipient: ADDRESSES.ZERO,
        makerTokenAddress: MakerToken.address,
        makerTokenAmount,
        takerTokenAddress: TakerToken.address,
        takerTokenAmount,
      },
    ),
  ]);

  MakerToken.address === WETH9.address ?
    await Promise.all([
      makerToken.deposit({ value: order.makerTokenAmount, from: order.maker }),
      makerToken.approve(ZeroExProxyV1.address, order.makerTokenAmount, { from: order.maker })
    ])
    :
    await issueAndSetAllowance(
      makerToken,
      order.maker,
      order.makerTokenAmount,
      ZeroExProxyV1.address,
    );
  return order;
}

function createMarginTokenContract(openTx, type) {
  if (type === POSITION_TYPE.SHORT) {
    return ERC20Short.new(
      openTx.id,
      Margin.address,
      openTx.trader,
      [DutchAuctionCloser.address],
      [ERC20PositionWithdrawer.address],
    );
  }
  if (type === POSITION_TYPE.LONG) {
    return ERC20Long.new(
      openTx.id,
      Margin.address,
      openTx.trader,
      [DutchAuctionCloser.address],
      [ERC20PositionWithdrawer.address],
    );
  }
}

function generateBuySellOrders(
  accounts,
  {
    MakerToken,
    TakerToken,
    amountToMint = new BigNumber('1e18'),
    multiplier = new BigNumber('10'),
  },
) {
  const orderAmount = multiplier.times(amountToMint);
  const orderBuyPrice = multiplier.times(BUY_PRICE);
  const orderSellPrice = multiplier.times(SELL_PRICE);
  return Promise.all([
    createOrderForToken(
      accounts,
      MakerToken,
      TakerToken,
      orderAmount,
      orderSellPrice,
    ),
    createOrderForToken(
      accounts,
      TakerToken,
      MakerToken,
      orderBuyPrice,
      orderAmount,
    ),
  ]);
}

async function createBucketLender(
  openTx,
  trader,
  deposit,
  principal,
) {
  const bucketLender = await BucketLender.new(
    Margin.address,
    openTx.id,
    openTx.heldToken,
    openTx.owedToken,
    [
      BIGNUMBERS.ONE_DAY_IN_SECONDS,
      openTx.loanOffering.rates.interestRate,
      openTx.loanOffering.rates.interestPeriod,
      openTx.loanOffering.maxDuration,
      openTx.loanOffering.callTimeLimit,
      deposit.div(new BigNumber('1e18')), // MIN_HELD_TOKEN_NUMERATOR,
      principal.div(new BigNumber('1e18')), // MIN_HELD_TOKEN_DENOMINATOR,
    ],
    [trader], // trusted margin-callers
    [BucketLenderProxy.address] // trusted withdrawers
  );

  return bucketLender;
}

module.exports = {
  createMarginToken,
  generateBuySellOrders,
  createOrderForToken,
};
