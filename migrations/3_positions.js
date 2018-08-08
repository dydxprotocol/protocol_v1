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

global.artifacts = artifacts;
global.web3 = web3;

const fs = require('fs');
const promisify = require("es6-promisify");
const Margin = artifacts.require('Margin');
const ZeroExProxy = artifacts.require('ZeroExProxy');
const TestToken = artifacts.require('TestToken');
const { isDevNetwork } = require('./helpers');
const { snapshot } = require('../src/snapshots');
const { doOpenPosition, getPosition } = require('../test/helpers/MarginHelper');
const { createShortToken } = require('../test/helpers/ERC20PositionHelper');
const { ADDRESSES } = require('../test/helpers/Constants');
const { createSignedBuyOrder, createSignedSellOrder } = require('../test/helpers/ZeroExHelper');
const { issueAndSetAllowance } = require('../test/helpers/TokenHelper');

web3.currentProvider.sendAsync = web3.currentProvider.send;

const writeFileAsync = promisify(fs.writeFile);

async function doMigration(deployer, network, accounts) {
  if (isDevNetwork(network)) {
    const seeds = {};

    // Needs to complete before createSeedOrders
    const positions = await createSeedPositions(accounts);

    const orders = await createSeedOrders(accounts);

    await snapshot(web3);

    seeds.positions = positions;
    seeds.orders = orders;

    const json = JSON.stringify(seeds, null, 4);
    await writeFileAsync(__dirname + '/../build/seeds.json', json, 'utf8');
  }
}

async function createSeedPositions(accounts) {
  let salt = 729436712;
  const openTransactions = [];

  openTransactions.push(await doOpenPosition(accounts, { salt: salt++ }));
  openTransactions.push(await doOpenPosition(accounts, { salt: salt++ }));
  openTransactions.push(await doOpenPosition(accounts, { salt: salt++ }));
  openTransactions.push(await createShortToken(accounts, { salt: salt++ }));

  const margin = await Margin.deployed();
  const positions = await Promise.all(openTransactions.map(t => getPosition(margin, t.id)));
  for (let i = 0; i < openTransactions.length; i++) {
    positions[i].id = openTransactions[i].id;

    positions[i].isTokenized = i === 3 ? true : false;
  }

  return positions;
}

async function createSeedOrders(accounts) {
  const orders = await Promise.all([
    createSignedBuyOrder(accounts, { salt: 7294234423, feeRecipient: ADDRESSES.ZERO }),
    createSignedSellOrder(accounts, { salt: 7294234424, feeRecipient: ADDRESSES.ZERO }),
  ]);

  const makerTokens = await Promise.all(orders.map(order => TestToken.at(order.makerTokenAddress)));

  await Promise.all(orders.map((order, i) => {
    return issueAndSetAllowance(
      makerTokens[i],
      order.maker,
      order.makerTokenAmount,
      ZeroExProxy.address,
    )
  }));

  return orders;
}

module.exports = (deployer, network, accounts) => {
  deployer.then(() => doMigration(deployer, network, accounts));
};
