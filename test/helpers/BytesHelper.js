const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);

function toBytes32(val) {
  return web3Instance.utils.hexToBytes(
    web3Instance.utils.padLeft(web3Instance.utils.toHex(val), 64)
  );
}

function zeroExOrderToBytes(order) {
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

module.exports = {
  toBytes32,
  zeroExOrderToBytes
}
