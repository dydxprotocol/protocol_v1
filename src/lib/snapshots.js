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

/**
 * Attempts to reset the EVM to its initial state. Useful for testing suites
 *
 * @param {Provider} provider a valid web3 provider
 * @returns {null} null
 */
export async function resetEVM(provider) {
  const id = await snapshot(provider);

  if (id !== '0x1') {
    await reset(provider, '0x1');
  }
}

export async function reset(provider, id) {
  if (!id) {
    throw new Error('id must be set');
  }

  const args = {
    jsonrpc: "2.0",
    method: "evm_revert",
    id: 12345,
    params: [id],
  };

  await sendAsync(provider, args);

  return snapshot(provider);
}

export async function snapshot(provider) {
  const args = {
    jsonrpc: "2.0",
    method: "evm_snapshot",
    id: 12345,
  };

  const response = await sendAsync(provider, args);

  return response.result;
}

async function sendAsync(provider, args) {
  // Needed for different versions of web3
  const func = provider.sendAsync || provider.send;
  let response;

  response = await new Promise((resolve, reject) => func.call(
    provider,
    args,
    (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    }
  ));

  return response;
}
