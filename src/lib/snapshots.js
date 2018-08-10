/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

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
