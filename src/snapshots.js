import promisify from "es6-promisify";

export async function reset(web3Instance, id) {
  // Needed for different versions of web3
  const func = web3Instance.currentProvider.sendAsync || web3Instance.currentProvider.send;

  await promisify(func)({
    jsonrpc: "2.0",
    method: "evm_revert",
    id: 12345,
    params: [id || '0x01'],
  });

  return snapshot(web3Instance);
}

export async function snapshot(web3Instance) {
  // Needed for different versions of web3
  const func = web3Instance.currentProvider.sendAsync || web3Instance.currentProvider.send;

  const response = await promisify(func)({
    jsonrpc: "2.0",
    method: "evm_snapshot",
    id: 12345,
  });

  return response.result;
}
