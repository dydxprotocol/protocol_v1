const promisify = require("es6-promisify");

function revert() {
  return promisify(web3.currentProvider.sendAsync)({
    jsonrpc: "2.0",
    method: "evm_revert",
    id: 12345,
    params: ['0x1'],
  });
}

function snapshot() {
  return promisify(web3.currentProvider.sendAsync)({
    jsonrpc: "2.0",
    method: "evm_snapshot",
    id: 12345
  });
}

async function doMigration(deployer, network) {
  if (network === 'docker') {
    const id = await snapshot();
    console.log(id)

    const r = await revert();
    console.log(r)
  }
}

module.exports = (deployer, network, _addresses) => {
  deployer.then(() => doMigration(deployer, network));
};
