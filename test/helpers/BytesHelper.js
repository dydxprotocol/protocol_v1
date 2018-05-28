const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);

function toBytes(val) {
  return web3Instance.utils.hexToBytes(
    web3Instance.utils.padLeft(web3Instance.utils.toHex(val), 64)
  );
}

function zeroExOrderToBytes(order) {
  const v = [].concat(toBytes(order.maker))
    .concat(toBytes(order.taker))
    .concat(toBytes(order.feeRecipient))
    .concat(toBytes(order.makerTokenAmount))
    .concat(toBytes(order.takerTokenAmount))
    .concat(toBytes(order.makerFee))
    .concat(toBytes(order.takerFee))
    .concat(toBytes(order.expirationUnixTimestampSec))
    .concat(toBytes(order.salt))
    .concat(toBytes(order.ecSignature.v))
    .concat(toBytes(order.ecSignature.r))
    .concat(toBytes(order.ecSignature.s));
  return web3Instance.utils.bytesToHex(v);
}

module.exports = {
  zeroExOrderToBytes
}
