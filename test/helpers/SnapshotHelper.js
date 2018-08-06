const promisify = require("es6-promisify");

const sendAsync = promisify(web3.currentProvider.sendAsync);

function revert(checkpoint) {
  return sendAsync({
    jsonrpc: "2.0",
    method: "evm_revert",
    id: 12345,
    params: [checkpoint],
  });
}

function snapshot() {
  return sendAsync({
    jsonrpc: "2.0",
    method: "evm_snapshot",
    id: 12345
  });
}

module.exports = {
  snapshot,
  revert,
};
