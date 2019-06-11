const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
const BigNumber = require('bignumber.js');
const promisify = require("es6-promisify");
const ethUtil = require('ethereumjs-util');

const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
let { ZeroExExchangeV2 } = require("../contracts/ZeroExV2");

const { ADDRESSES, BIGNUMBERS, DEFAULT_SALT, ORDER_TYPE } = require('./Constants');
const { addressToBytes32, concatBytes } = require('./BytesHelper');

const BASE_AMOUNT = new BigNumber('1098623452345987123')

async function createSignedV2SellOrder(
  accounts,
  {
    feeRecipientAddress,
    salt = DEFAULT_SALT,
    fees = true,
    makerAssetMultiplier = '6.382472',
    takerAssetMultiplier = '19.123475',
    expirationTimeSeconds = '100000000000000',
    makerAddress = null,
  } = {}
) {
  let order = {
    type: ORDER_TYPE.ZERO_EX_V2,
    exchangeAddress: ZeroExExchangeV2.address,

    makerAddress: makerAddress || accounts[5],
    takerAddress: ADDRESSES.ZERO,
    feeRecipientAddress: feeRecipientAddress || accounts[6],
    senderAddress: ADDRESSES.ZERO,

    makerFee: fees ? BASE_AMOUNT.times(0.010928345).floor() : BIGNUMBERS.ZERO,
    takerFee: fees? BASE_AMOUNT.times(0.109128341).floor() : BIGNUMBERS.ZERO,
    expirationTimeSeconds: new BigNumber(expirationTimeSeconds),
    salt: new BigNumber(salt),

    // owedToken
    makerTokenAddress: OwedToken.address,
    makerAssetAmount: BASE_AMOUNT.times(makerAssetMultiplier).floor(),

    // heldToken
    takerTokenAddress: HeldToken.address,
    takerAssetAmount: BASE_AMOUNT.times(takerAssetMultiplier).floor()
  };

  order.signature = await signV2Order(order);

  return order;
}

async function createSignedV2BuyOrder(
  accounts,
  {
    salt = DEFAULT_SALT,
    feeRecipientAddress,
  } = {}
) {
  let order = {
    type: ORDER_TYPE.ZERO_EX_V2,
    exchangeAddress: ZeroExExchangeV2.address,

    makerAddress: accounts[2],
    takerAddress: ADDRESSES.ZERO,
    feeRecipientAddress: feeRecipientAddress || accounts[4],
    senderAddress: ADDRESSES.ZERO,

    makerFee: BASE_AMOUNT.times(.02012398).floor(),
    takerFee: BASE_AMOUNT.times(.1019238).floor(),
    expirationTimeSeconds: new BigNumber(100000000000000),
    salt: new BigNumber(salt),

    // heldToken
    makerTokenAddress: HeldToken.address,
    makerAssetAmount: BASE_AMOUNT.times(30.091234687).floor(),

    // owedToken
    takerTokenAddress: OwedToken.address,
    takerAssetAmount: BASE_AMOUNT.times(10.092138781).floor(),
  };

  order.signature = await signV2Order(order);

  return order;
}

async function createSignedV2Order(
  accounts,
  {
    salt = DEFAULT_SALT,
    feeRecipientAddress,
    makerAddress,
    makerToken,
    makerAssetAmount,
    takerToken,
    takerAssetAmount,
  }
) {
  const order = {
    type: ORDER_TYPE.ZERO_EX_V2,
    exchangeAddress: ZeroExExchangeV2.address,

    makerAddress: makerAddress || accounts[5],
    takerAddress: ADDRESSES.ZERO,
    feeRecipientAddress: feeRecipientAddress || accounts[6],
    senderAddress: ADDRESSES.ZERO,

    makerFee: BASE_AMOUNT.times(0.010928345).floor(),
    takerFee: BASE_AMOUNT.times(0.109128341).floor(),
    expirationTimeSeconds: new BigNumber(100000000000000),
    salt: new BigNumber(salt),

    makerTokenAddress: makerToken,
    makerAssetAmount: makerAssetAmount || BASE_AMOUNT.times(6.382472).floor(),
    takerTokenAddress: takerToken,
    takerAssetAmount: takerAssetAmount || BASE_AMOUNT.times(19.123475).floor()
  };

  order.signature = await signV2Order(order);

  return order;
}

async function signV2Order(order) {
  const signature = await promisify(web3Instance.eth.sign)(
    getV2OrderHash(order), order.makerAddress
  );

  const { v, r, s } = ethUtil.fromRpcSig(signature);

  // 0x00 Illegal
  // 0x01 Invalid
  // 0x02 EIP712 (no prepended string)
  // 0x03 EthSign (prepended "\x19Ethereum Signed Message:\n32")
  // 0x04 Wallet
  // 0x05 Validator
  // 0x06 PreSigned
  // 0x07 NSignatureTypes
  const sigType = 3;

  return ethUtil.bufferToHex(
    Buffer.concat([
      ethUtil.toBuffer(v),
      r,
      s,
      ethUtil.toBuffer(sigType)
    ])
  );
}

function getV2OrderHash(order) {

  const eip712Hash = "0x770501f88a26ede5c04a20ef877969e961eb11fc13b78aaf414b633da0d4f86f";

  const makerAssetData = addressToAssetData(order.makerTokenAddress);
  const takerAssetData = addressToAssetData(order.takerTokenAddress);

  const basicHash = web3Instance.utils.soliditySha3(
    { t: 'bytes32', v: eip712Hash },
    { t: 'bytes32', v: addressToBytes32(order.makerAddress) },
    { t: 'bytes32', v: addressToBytes32(order.takerAddress) },
    { t: 'bytes32', v: addressToBytes32(order.feeRecipientAddress) },
    { t: 'bytes32', v: addressToBytes32(order.senderAddress) },
    { t: 'uint256', v: order.makerAssetAmount },
    { t: 'uint256', v: order.takerAssetAmount },
    { t: 'uint256', v: order.makerFee },
    { t: 'uint256', v: order.takerFee },
    { t: 'uint256', v: order.expirationTimeSeconds },
    { t: 'uint256', v: order.salt },
    { t: 'bytes32', v: web3Instance.utils.soliditySha3({ t: 'bytes', v: makerAssetData })},
    { t: 'bytes32', v: web3Instance.utils.soliditySha3({ t: 'bytes', v: takerAssetData })}
  );

  const eip712DomSepHash = "0x91ab3d17e3a50a9d89e63fd30b92be7f5336b03b287bb946787a83a9d62a2766";

  const eip712DomainHash = web3Instance.utils.soliditySha3(
    { t: 'bytes32', v: eip712DomSepHash },
    { t: 'bytes32', v: web3Instance.utils.soliditySha3({ t: 'string', v: '0x Protocol' })},
    { t: 'bytes32', v: web3Instance.utils.soliditySha3({ t: 'string', v: '2' })},
    { t: 'bytes32', v: addressToBytes32(order.exchangeAddress) }
  );

  const retVal = web3Instance.utils.soliditySha3(
    { t: 'bytes', v: "0x1901" },
    { t: 'bytes32', v: eip712DomainHash },
    { t: 'bytes32', v: basicHash },
  );

  return retVal;
}

function addressToAssetData(address) {
  const assetDataPrepend = '0xf47261b0';
  return concatBytes(assetDataPrepend, addressToBytes32(address));
}

module.exports = {
  createSignedV2SellOrder,
  createSignedV2BuyOrder,
  createSignedV2Order,
  signV2Order,
  getV2OrderHash,
  addressToAssetData,
}
