const promisify = require("es6-promisify");

export function revert(checkpoint) {
  return promisify(web3.currentProvider.sendAsync)({
    jsonrpc: "2.0",
    method: "evm_revert",
    id: 12345,
    params: [checkpoint],
  });
}

export function snapshot() {
  return promisify(web3.currentProvider.sendAsync)({
    jsonrpc: "2.0",
    method: "evm_snapshot",
    id: 12345
  });
}
