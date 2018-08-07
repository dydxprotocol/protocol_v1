global.artifacts = artifacts;
global.web3 = web3;

const fs = require('fs');
const promisify = require("es6-promisify");
const Margin = artifacts.require('Margin');
const { isDevNetwork } = require('./helpers');
const { snapshot } = require('../test/helpers/SnapshotHelper');
const { doOpenPosition, getPosition } = require('../test/helpers/MarginHelper');

web3.currentProvider.sendAsync = web3.currentProvider.send;

const writeFileAsync = promisify(fs.writeFile);

async function doMigration(deployer, network, accounts) {
  if (isDevNetwork(network)) {
    let salt = 729436712;
    const openTransactions = [];

    openTransactions.push(await doOpenPosition(accounts, { salt: salt++ }));
    openTransactions.push(await doOpenPosition(accounts, { salt: salt++ }));
    openTransactions.push(await doOpenPosition(accounts, { salt: salt++ }));

    await snapshot();
    const margin = await Margin.deployed();
    const positions = await Promise.all(openTransactions.map(t => getPosition(margin, t.id)));
    for (let i = 0; i < openTransactions.length; i++) {
      positions[i].id = openTransactions[i].id;
    }

    const json = JSON.stringify(positions, null, 4);

    await writeFileAsync(__dirname + '/../build/test-positions.json', json, 'utf8');
  }
}

module.exports = (deployer, network, accounts) => {
  deployer.then(() => doMigration(deployer, network, accounts));
};
