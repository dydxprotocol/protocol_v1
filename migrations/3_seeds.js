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
const BigNumber = require('bignumber.js');
const Margin = artifacts.require('Margin');
const WETH9 = artifacts.require('WETH9');
const TokenA = artifacts.require('TokenA');
const { isDevNetwork } = require('./helpers');
const { POSITION_TYPE } = require('../test/helpers/Constants');
const { doOpenPosition, getPosition } = require('../test/helpers/MarginHelper');
const {
  createMarginToken,
  generateBuySellOrders,
} = require('../test/helpers/ERC20PositionHelper');
const mkdirp = require('mkdirp');

const mkdirAsync = promisify(mkdirp);
web3.currentProvider.sendAsync = web3.currentProvider.send;

const writeFileAsync = promisify(fs.writeFile);

const LEVERAGED_AMOUNTS = {
  DEPOSIT_ETH: new BigNumber('1e18'),
  PRINCIPAL_DAI: new BigNumber('150e18')
};

const SHORT_AMOUNTS = {
  DEPOSIT_DAI: new BigNumber('500e18'),
  PRINCIPAL_ETH: new BigNumber('1e18'),
};

async function doMigration(deployer, network, accounts) {
  if (isDevNetwork(network)) {
    const directory = __dirname + '/../build/';
    await mkdirAsync(directory);

    const seeds = {};

    // Needs to complete before createSeedOrders
    const positions = await createSeedPositions(accounts);

    const orders = await generateBuySellOrders(
      accounts,
      {
        MakerToken: WETH9,
        TakerToken: TokenA,
      }
    );

    seeds.positions = positions;
    seeds.orders = orders;

    const json = JSON.stringify(seeds, null, 4);
    await writeFileAsync(directory + '/seeds.json', json, 'utf8');
  }
}

async function createSeedPositions(accounts) {
  let salt = 729436712;
  let nonce = 238947238;
  const openTransactions = [];
  const trader = accounts[8]

  openTransactions.push(await doOpenPosition(accounts, { salt: salt++, nonce: nonce++ }));
  openTransactions.push(await doOpenPosition(accounts, { salt: salt++, nonce: nonce++ }));
  openTransactions.push(await doOpenPosition(accounts, { salt: salt++, nonce: nonce++ }));
  openTransactions.push(await createMarginToken(
    accounts,
    {
      type: POSITION_TYPE.LONG,
      salt: salt++,
      nonce: nonce++,
      trader,
      HeldToken: WETH9,
      OwedToken: TokenA,
      deposit: LEVERAGED_AMOUNTS.DEPOSIT_ETH,
      principal: LEVERAGED_AMOUNTS.PRINCIPAL_DAI,
    }
  ));
  openTransactions.push(await createMarginToken(
    accounts,
    {
      type: POSITION_TYPE.SHORT,
      salt: salt++,
      nonce: nonce++,
      trader,
      HeldToken: TokenA,
      OwedToken: WETH9,
      deposit: SHORT_AMOUNTS.DEPOSIT_DAI,
      principal: SHORT_AMOUNTS.PRINCIPAL_ETH,
    }
  ));

  const margin = await Margin.deployed();

  const positionPromises = openTransactions.map(t => getPosition(margin, t.id));
  const balancePromises = openTransactions.map(t => margin.getPositionBalance.call(t.id));

  const [positions, balances] = await Promise.all([
    Promise.all(positionPromises),
    Promise.all(balancePromises)
  ]);

  for (let i = 0; i < openTransactions.length; i++) {
    positions[i].id = openTransactions[i].id;
    positions[i].balance = balances[i];

    if (i === 3 || i === 4) {
      positions[i].isTokenized = true;
      positions[i].positionOpener = trader;
    }
  }

  return positions;
}

module.exports = (deployer, network, accounts) => {
  deployer.then(() => doMigration(deployer, network, accounts));
};
