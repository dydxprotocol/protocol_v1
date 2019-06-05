const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
const BigNumber = require('bignumber.js');

function toBytes32(val) {
  return web3Instance.utils.hexToBytes(
    web3Instance.utils.padLeft(web3Instance.utils.toHex(val), 64)
  );
}

function toHex32(val) {
  return web3Instance.utils.padLeft(web3Instance.utils.toHex(val), 64);
}

// converts an address hex string to a bytes hex string
function addressToBytes32(address) {
  return '0x000000000000000000000000' + address.substr(2);
}

// concatenates hex strings into a single hex string
function concatBytes(/* ... */) {
  let retVal = "0x";
  for (let i = 0; i < arguments.length; i++) {
    retVal = retVal + arguments[i].substr(2);
  }
  return retVal;
}

function zeroExV1OrderToBytes(order) {
  const v = []
    .concat(toBytes32(order.maker))
    .concat(toBytes32(order.taker))
    .concat(toBytes32(order.feeRecipient))
    .concat(toBytes32(order.makerTokenAmount))
    .concat(toBytes32(order.takerTokenAmount))
    .concat(toBytes32(order.makerFee))
    .concat(toBytes32(order.takerFee))
    .concat(toBytes32(order.expirationUnixTimestampSec))
    .concat(toBytes32(order.salt))
    .concat(toBytes32(order.ecSignature.v))
    .concat(toBytes32(order.ecSignature.r))
    .concat(toBytes32(order.ecSignature.s));
  return web3Instance.utils.bytesToHex(v);
}

function zeroExV2OrderToBytes(order) {
  const v = []
    .concat(toBytes32(order.makerAddress))
    .concat(toBytes32(order.takerAddress))
    .concat(toBytes32(order.feeRecipientAddress))
    .concat(toBytes32(order.senderAddress))
    .concat(toBytes32(order.makerAssetAmount))
    .concat(toBytes32(order.takerAssetAmount))
    .concat(toBytes32(order.makerFee))
    .concat(toBytes32(order.takerFee))
    .concat(toBytes32(order.expirationTimeSeconds))
    .concat(toBytes32(order.salt))
    .concat(toBytes32(order.signature));
  return web3Instance.utils.bytesToHex(v);
}

function zeroExV2MultiOrdersToBytes(orders, maxPrice = null) {
  let v = [];
  if (!maxPrice || maxPrice.isZero()) {
    v = v
      .concat(toBytes32(0))
      .concat(toBytes32(0));
  } else {
    v = v
      .concat(toBytes32(maxPrice.times('1e18')))
      .concat(toBytes32(new BigNumber('1e18')));
  }
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    v = v
      .concat(toBytes32(order.makerAddress))
      .concat(toBytes32(order.takerAddress))
      .concat(toBytes32(order.feeRecipientAddress))
      .concat(toBytes32(order.senderAddress))
      .concat(toBytes32(order.makerAssetAmount))
      .concat(toBytes32(order.takerAssetAmount))
      .concat(toBytes32(order.expirationTimeSeconds))
      .concat(toBytes32(order.salt))
      .concat(toBytes32(order.signature));
  }
  return web3Instance.utils.bytesToHex(v);
}

module.exports = {
  toBytes32,
  toHex32,
  zeroExV2MultiOrdersToBytes,
  zeroExV2OrderToBytes,
  zeroExV1OrderToBytes,
  addressToBytes32,
  concatBytes
}
