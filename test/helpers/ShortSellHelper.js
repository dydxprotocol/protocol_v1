/*global artifacts, web3*/

const expect = require('chai').expect;
const ZeroEx = require('0x.js').ZeroEx;
const promisify = require("es6-promisify");
const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const ethUtil = require('ethereumjs-util');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const Exchange = artifacts.require("Exchange");
const ProxyContract = artifacts.require("Proxy");

const web3Instance = new Web3(web3.currentProvider);

const BASE_AMOUNT = new BigNumber('1e18');

// PUBLIC

async function createShortSellTx(accounts) {
  const [loanOffering, buyOrder] = await Promise.all([
    createLoanOffering(accounts),
    createSigned0xBuyOrder(accounts)
  ]);

  const tx = {
    underlyingToken: UnderlyingToken.address,
    baseToken: BaseToken.address,
    shortAmount: BASE_AMOUNT,
    depositAmount: BASE_AMOUNT.times(new BigNumber(2)),
    loanOffering: loanOffering,
    buyOrder: buyOrder,
    seller: accounts[0]
  };

  return tx;
}

async function createSigned0xSellOrder(accounts) {
  // 4 baseToken : 1 underlyingToken rate
  let order = {
    exchangeContractAddress: Exchange.address,
    expirationUnixTimestampSec: new BigNumber(100000000000000),
    feeRecipient: accounts[6],
    maker: accounts[5],
    makerFee: BASE_AMOUNT.times(new BigNumber(.01)),
    makerTokenAddress: UnderlyingToken.address,
    makerTokenAmount: BASE_AMOUNT.times(new BigNumber(2)),
    salt: new BigNumber(342),
    taker: ZeroEx.NULL_ADDRESS,
    takerFee: BASE_AMOUNT.times(new BigNumber(.1)),
    takerTokenAddress: BaseToken.address,
    takerTokenAmount: BASE_AMOUNT.times(new BigNumber(8)),
    takerFeeTokenAddress: FeeToken.address,
    makerFeeTokenAddress: FeeToken.address
  };

  const signature = await signOrder(order);

  order.ecSignature = signature;

  return order;
}

function callShort(shortSell, tx) {
  const addresses = [
    UnderlyingToken.address,
    BaseToken.address,
    tx.loanOffering.lender,
    tx.loanOffering.taker,
    tx.loanOffering.feeRecipient,
    FeeToken.address,
    FeeToken.address,
    tx.buyOrder.maker,
    tx.buyOrder.taker,
    tx.buyOrder.feeRecipient,
    FeeToken.address,
    FeeToken.address
  ];

  const values256 = [
    tx.loanOffering.rates.minimumDeposit,
    tx.loanOffering.rates.maxAmount,
    tx.loanOffering.rates.minAmount,
    tx.loanOffering.rates.minimumSellAmount,
    tx.loanOffering.rates.interestRate,
    tx.loanOffering.rates.lenderFee,
    tx.loanOffering.rates.takerFee,
    tx.loanOffering.expirationTimestamp,
    tx.loanOffering.salt,
    tx.buyOrder.makerTokenAmount,
    tx.buyOrder.takerTokenAmount,
    tx.buyOrder.makerFee,
    tx.buyOrder.takerFee,
    tx.buyOrder.expirationUnixTimestampSec,
    tx.buyOrder.salt,
    tx.shortAmount,
    tx.depositAmount
  ];

  const values32 = [
    tx.loanOffering.lockoutTime,
    tx.loanOffering.callTimeLimit,
  ];

  const sigV = [
    tx.loanOffering.signature.v,
    tx.buyOrder.ecSignature.v
  ];

  const sigRS = [
    tx.loanOffering.signature.r,
    tx.loanOffering.signature.s,
    tx.buyOrder.ecSignature.r,
    tx.buyOrder.ecSignature.s
  ];

  return shortSell.short(
    addresses,
    values256,
    values32,
    sigV,
    sigRS,
    { from: tx.seller }
  );
}

async function issueTokensAndSetAllowancesForShort(tx) {
  const [underlyingToken, baseToken, feeToken] = await Promise.all([
    UnderlyingToken.deployed(),
    BaseToken.deployed(),
    FeeToken.deployed()
  ]);

  await Promise.all([
    underlyingToken.issueTo(
      tx.loanOffering.lender,
      tx.loanOffering.rates.maxAmount
    ),
    baseToken.issueTo(
      tx.seller,
      tx.depositAmount
    ),
    baseToken.issueTo(
      tx.buyOrder.maker,
      tx.buyOrder.makerTokenAmount
    ),
    feeToken.issueTo(
      tx.buyOrder.maker,
      tx.buyOrder.makerFee
    ),
    feeToken.issueTo(
      tx.loanOffering.lender,
      tx.loanOffering.rates.lenderFee
    ),
    feeToken.issueTo(
      tx.seller,
      tx.loanOffering.rates.takerFee.plus(tx.buyOrder.takerFee)
    )
  ]);

  return Promise.all([
    underlyingToken.approve(
      ProxyContract.address,
      tx.loanOffering.rates.maxAmount,
      { from: tx.loanOffering.lender }
    ),
    baseToken.approve(
      ProxyContract.address,
      tx.depositAmount,
      { from: tx.seller }
    ),
    baseToken.approve(
      ProxyContract.address,
      tx.buyOrder.makerTokenAmount,
      { from: tx.buyOrder.maker }
    ),
    feeToken.approve(
      ProxyContract.address,
      tx.buyOrder.makerFee,
      { from: tx.buyOrder.maker }
    ),
    feeToken.approve(
      ProxyContract.address,
      tx.loanOffering.rates.lenderFee,
      { from: tx.loanOffering.lender }
    ),
    feeToken.approve(
      ProxyContract.address,
      tx.loanOffering.rates.takerFee.plus(tx.buyOrder.takerFee),
      { from: tx.seller }
    )
  ]);
}

async function doShort(accounts) {
  const [shortTx, shortSell] = await Promise.all([
    createShortSellTx(accounts),
    ShortSell.deployed()
  ]);
  const shortId = web3Instance.utils.soliditySha3(
    shortTx.loanOffering.lender,
    0
  );

  const alreadyExists = await shortSell.containsShort.call(shortId);

  expect(alreadyExists).to.be.false;

  await issueTokensAndSetAllowancesForShort(shortTx);

  const response = await callShort(shortSell, shortTx);

  const contains = await shortSell.containsShort.call(shortId);
  expect(contains).to.be.true;

  shortTx.id = shortId;
  shortTx.response = response;
  return shortTx;
}

function callCloseShort(shortSell, shortTx, sellOrder) {
  const addresses = [
    sellOrder.maker,
    sellOrder.taker,
    sellOrder.feeRecipient,
    sellOrder.makerFeeTokenAddress,
    sellOrder.takerFeeTokenAddress
  ];
  const values = [
    sellOrder.makerTokenAmount,
    sellOrder.takerTokenAmount,
    sellOrder.makerFee,
    sellOrder.takerFee,
    sellOrder.expirationUnixTimestampSec,
    sellOrder.salt
  ];

  return shortSell.closeShort(
    shortTx.id,
    addresses,
    values,
    sellOrder.ecSignature.v,
    sellOrder.ecSignature.r,
    sellOrder.ecSignature.s
  );
}

async function issueTokensAndSetAllowancesForClose(shortTx, sellOrder) {
  const [underlyingToken, feeToken] = await Promise.all([
    UnderlyingToken.deployed(),
    FeeToken.deployed(),
  ]);

  await Promise.all([
    underlyingToken.issueTo(
      sellOrder.maker,
      sellOrder.makerTokenAmount
    ),
    feeToken.issueTo(
      shortTx.seller,
      sellOrder.takerFee
    ),
    feeToken.issueTo(
      sellOrder.maker,
      sellOrder.makerFee
    )
  ]);

  return Promise.all([
    underlyingToken.approve(
      ProxyContract.address,
      sellOrder.makerTokenAmount,
      { from: sellOrder.maker }
    ),
    feeToken.approve(
      ProxyContract.address,
      sellOrder.makerFee,
      { from: sellOrder.maker }
    ),
    feeToken.approve(
      ProxyContract.address,
      sellOrder.takerFee,
      { from: shortTx.seller }
    )
  ]);
}

// HELPERS

async function createSigned0xBuyOrder(accounts) {
  // 3 baseToken : 1 underlyingToken rate
  let order = {
    exchangeContractAddress: Exchange.address,
    expirationUnixTimestampSec: new BigNumber(100000000000000),
    feeRecipient: accounts[4],
    maker: accounts[2],
    makerFee: BASE_AMOUNT.times(new BigNumber(.02)),
    makerTokenAddress: BaseToken.address,
    makerTokenAmount: BASE_AMOUNT.times(new BigNumber(6)),
    salt: new BigNumber(7324),
    taker: ZeroEx.NULL_ADDRESS,
    takerFee: BASE_AMOUNT.times(new BigNumber(.1)),
    takerTokenAddress: UnderlyingToken.address,
    takerTokenAmount: BASE_AMOUNT.times(new BigNumber(2)),
    makerFeeTokenAddress: FeeToken.address,
    takerFeeTokenAddress: FeeToken.address,
  };

  const orderHash = getOrderHash(order);
  const signature = await signOrder(order);

  order.ecSignature = signature;

  return order;
}

async function createLoanOffering(accounts) {
  let loanOffering = {
    lender: accounts[1],
    taker: ZeroEx.NULL_ADDRESS,
    feeRecipient: accounts[3],
    rates: {
      minimumDeposit: BASE_AMOUNT,
      maxAmount: BASE_AMOUNT.times(new BigNumber(3)),
      minAmount: BASE_AMOUNT.times(new BigNumber(.1)),
      minimumSellAmount: BASE_AMOUNT.times(new BigNumber(.01)),
      interestRate: BASE_AMOUNT.times(new BigNumber(.1)),
      lenderFee: BASE_AMOUNT.times(new BigNumber(.01)),
      takerFee: BASE_AMOUNT.times(new BigNumber(.02))
    },
    expirationTimestamp: 1000000000000,
    lockoutTime: 100000,
    callTimeLimit: 100000,
    salt: 123
  };

  loanOffering.signature = await signLoanOffering(loanOffering);

  return loanOffering;
}

async function signLoanOffering(loanOffering) {
  const valuesHash = web3Instance.utils.soliditySha3(
    loanOffering.rates.minimumDeposit,
    loanOffering.rates.maxAmount,
    loanOffering.rates.minAmount,
    loanOffering.rates.minimumSellAmount,
    loanOffering.rates.interestRate,
    loanOffering.rates.lenderFee,
    loanOffering.rates.takerFee,
    loanOffering.expirationTimestamp,
    { type: 'uint32', value: loanOffering.lockoutTime },
    { type: 'uint32', value: loanOffering.callTimeLimit },
    loanOffering.salt
  );
  const hash = web3Instance.utils.soliditySha3(
    ShortSell.address,
    UnderlyingToken.address,
    BaseToken.address,
    loanOffering.lender,
    loanOffering.taker,
    loanOffering.feeRecipient,
    FeeToken.address,
    FeeToken.address,
    valuesHash
  );

  const signature = await promisify(web3Instance.eth.sign)(
    hash, loanOffering.lender
  );

  const { v, r, s } = ethUtil.fromRpcSig(signature);

  return {
    v,
    r: ethUtil.bufferToHex(r),
    s: ethUtil.bufferToHex(s)
  }
}

async function signOrder(order) {
  const signature = await promisify(web3Instance.eth.sign)(
    getOrderHash(order), order.maker
  );

  const { v, r, s } = ethUtil.fromRpcSig(signature);

  return {
    v,
    r: ethUtil.bufferToHex(r),
    s: ethUtil.bufferToHex(s)
  };
}

function getOrderHash(order) {
  return web3Instance.utils.soliditySha3(
    Exchange.address,
    order.maker,
    order.taker,
    order.makerTokenAddress,
    order.takerTokenAddress,
    order.feeRecipient,
    order.makerFeeTokenAddress,
    order.takerFeeTokenAddress,
    order.makerTokenAmount,
    order.takerTokenAmount,
    order.makerFee,
    order.takerFee,
    order.expirationUnixTimestampSec,
    order.salt
  )
}

function getPartialAmount(
  numerator,
  denominator,
  target
) {
  return numerator.times(target).div(denominator).floor();
}


module.exports = {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  createSigned0xSellOrder,
  doShort,
  issueTokensAndSetAllowancesForClose,
  callCloseShort,
  getPartialAmount
};
