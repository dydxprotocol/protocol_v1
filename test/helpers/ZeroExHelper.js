import { ZeroEx } from '0x.js';
import Web3 from 'web3';
import BigNumber from 'bignumber.js';
import promisify from 'es6-promisify';
import ethUtil from 'ethereumjs-util';
import { DEFAULT_SALT, ORDER_TYPE } from './Constants';

const ZeroExExchange = artifacts.require('ZeroExExchange');
const HeldToken = artifacts.require('TokenA');
const OwedToken = artifacts.require('TokenB');
const FeeToken = artifacts.require('TokenC');

const web3Instance = new Web3(web3.currentProvider);

const BASE_AMOUNT = new BigNumber('1098623452345987123');

export async function createSignedSellOrder(
  accounts,
  {
    salt = DEFAULT_SALT,
  } = {},
) {
  const order = {
    type: ORDER_TYPE.ZERO_EX,
    exchangeContractAddress: ZeroExExchange.address,
    expirationUnixTimestampSec: new BigNumber(100000000000000),
    feeRecipient: accounts[6],
    maker: accounts[5],
    makerFee: BASE_AMOUNT.times(0.010928345).floor(),
    salt: new BigNumber(salt),
    taker: ZeroEx.NULL_ADDRESS,
    takerFee: BASE_AMOUNT.times(0.109128341).floor(),

    // owedToken
    makerTokenAddress: OwedToken.address,
    makerTokenAmount: BASE_AMOUNT.times(6.382472).floor(),

    // heldToken
    takerTokenAddress: HeldToken.address,
    takerTokenAmount: BASE_AMOUNT.times(19.123475).floor(),
  };

  order.ecSignature = await signOrder(order);

  return order;
}

export async function createSignedBuyOrder(
  accounts,
  {
    salt = DEFAULT_SALT,
  } = {},
) {
  const order = {
    type: ORDER_TYPE.ZERO_EX,
    exchangeContractAddress: ZeroExExchange.address,
    expirationUnixTimestampSec: new BigNumber(100000000000000),
    feeRecipient: accounts[4],
    maker: accounts[2],
    makerFee: BASE_AMOUNT.times(0.02012398).floor(),
    salt: new BigNumber(salt),
    taker: ZeroEx.NULL_ADDRESS,
    takerFee: BASE_AMOUNT.times(0.1019238).floor(),
    makerFeeTokenAddress: FeeToken.address,
    takerFeeTokenAddress: FeeToken.address,

    // heldToken
    makerTokenAddress: HeldToken.address,
    makerTokenAmount: BASE_AMOUNT.times(30.091234687).floor(),

    // owedToken
    takerTokenAddress: OwedToken.address,
    takerTokenAmount: BASE_AMOUNT.times(10.092138781).floor(),
  };

  order.ecSignature = await signOrder(order);

  return order;
}

export async function signOrder(order) {
  const signature = await promisify(web3Instance.eth.sign)(
    getOrderHash(order), order.maker,
  );

  const { v, r, s } = ethUtil.fromRpcSig(signature);

  return {
    v,
    r: ethUtil.bufferToHex(r),
    s: ethUtil.bufferToHex(s),
  };
}

export function getOrderHash(order) {
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
    order.salt,
  );
}
