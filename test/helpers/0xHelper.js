/*global artifacts, web3*/

const ZeroExExchange = artifacts.require("ZeroExExchange");
const ZeroEx = require('0x.js').ZeroEx;
const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const promisify = require("es6-promisify");
const ethUtil = require('ethereumjs-util');
const { BIGNUMBERS, DEFAULT_SALT } = require('./Constants');

const web3Instance = new Web3(web3.currentProvider);

async function createSignedSellOrder(accounts, _salt = DEFAULT_SALT) {
  // 4 baseToken : 1 underlyingToken rate
  let order = {
    exchangeContractAddress: ZeroExExchange.address,
    expirationUnixTimestampSec: new BigNumber(100000000000000),
    feeRecipient: accounts[6],
    maker: accounts[5],
    makerFee: BIGNUMBERS.BASE_AMOUNT.times(new BigNumber(.01)),
    makerTokenAddress: UnderlyingToken.address,
    makerTokenAmount: BIGNUMBERS.BASE_AMOUNT.times(new BigNumber(2)),
    salt: new BigNumber(_salt),
    taker: ZeroEx.NULL_ADDRESS,
    takerFee: BIGNUMBERS.BASE_AMOUNT.times(new BigNumber(.1)),
    takerTokenAddress: BaseToken.address,
    takerTokenAmount: BIGNUMBERS.BASE_AMOUNT.times(new BigNumber(8))
  };

  const signature = await signOrder(order);

  order.ecSignature = signature;

  return order;
}

async function createSignedBuyOrder(accounts, _salt = DEFAULT_SALT) {
  // 3 baseToken : 1 underlyingToken rate
  let order = {
    exchangeContractAddress: ZeroExExchange.address,
    expirationUnixTimestampSec: new BigNumber(100000000000000),
    feeRecipient: accounts[4],
    maker: accounts[2],
    makerFee: BIGNUMBERS.BASE_AMOUNT.times(.02),
    makerTokenAddress: BaseToken.address,
    makerTokenAmount: BIGNUMBERS.BASE_AMOUNT.times(6),
    salt: new BigNumber(_salt),
    taker: ZeroEx.NULL_ADDRESS,
    takerFee: BIGNUMBERS.BASE_AMOUNT.times(.1),
    takerTokenAddress: UnderlyingToken.address,
    takerTokenAmount: BIGNUMBERS.BASE_AMOUNT.times(2),
    makerFeeTokenAddress: FeeToken.address,
    takerFeeTokenAddress: FeeToken.address,
  };

  const signature = await signOrder(order);

  order.ecSignature = signature;

  return order;
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
    ZeroExExchange.address,
    order.maker,
    order.taker,
    order.makerTokenAddress,
    order.takerTokenAddress,
    order.feeRecipient,
    order.makerTokenAmount,
    order.takerTokenAmount,
    order.makerFee,
    order.takerFee,
    order.expirationUnixTimestampSec,
    order.salt
  )
}

module.exports = {
  createSignedSellOrder,
  createSignedBuyOrder,
  signOrder,
  getOrderHash
}
