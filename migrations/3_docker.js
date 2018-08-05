global.artifacts = artifacts;
global.web3 = web3;

const fs = require('fs');
const promisify = require("es6-promisify");
const Margin = artifacts.require('Margin');
const { snapshot } = require('../test/helpers/SnapshotHelper');
const { doOpenPosition, getPosition } = require('../test/helpers/MarginHelper');
const { DEFAULT_SALT } = require('../test/helpers/Constants');

web3.currentProvider.sendAsync = web3.currentProvider.send;

const writeFileAsync = promisify(fs.writeFile);

async function doMigration(deployer, network, accounts) {
  if (network === 'docker') {
    let salt = DEFAULT_SALT;
    const openTransactions = [];

    openTransactions.push(await doOpenPosition(accounts, { salt: salt++ }));
    openTransactions.push(await doOpenPosition(accounts, { salt: salt++ }));
    openTransactions.push(await doOpenPosition(accounts, { salt: salt++ }));

    await snapshot();
    const margin = await Margin.deployed();
    const positions = await Promise.all(openTransactions.map(t => getPosition(margin, t.id)));

    const json = JSON.stringify(positions);

    await writeFileAsync(__dirname + '/../build/test-positions.json', json, 'utf8');
  }
}

module.exports = (deployer, network, accounts) => {
  deployer.then(() => doMigration(deployer, network, accounts));
};
