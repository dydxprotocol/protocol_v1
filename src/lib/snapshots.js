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

export async function reset(provider, id) {
  const args = {
    jsonrpc: "2.0",
    method: "evm_revert",
    id: 12345,
    params: [id || '0x01'],
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
  let response;

  // Needed for different versions of web3
  if (provider.sendAsync) {
    response = await new Promise((resolve, reject) => provider.sendAsync(
      args,
      (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      }
    ));
  } else {
    response = await new Promise((resolve, reject) => provider.send(
      args,
      (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      }
    ));
  }

  return response;
}
