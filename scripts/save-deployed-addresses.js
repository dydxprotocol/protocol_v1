import * as contracts from '../src/lib/contracts';
import fs from 'fs';
import promisify from 'es6-promisify';
import mkdirp from 'mkdirp';

const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(mkdirp);

const NETWORK_ID = '42';

async function run() {
  const directory = __dirname + '/../migrations/';
  await mkdirAsync(directory);

  const deployed = {};

  Object.keys(contracts).forEach(contractName => {
    const contract = contracts[contractName];

    if (contract.networks[NETWORK_ID]) {
      deployed[contractName] = {};

      deployed[contractName][NETWORK_ID] = {
        links: contract.networks[NETWORK_ID].links,
        address: contract.networks[NETWORK_ID].address,
        transactionHash: contract.networks[NETWORK_ID].transactionHash,
      };
    }
  });

  const json = JSON.stringify(deployed, null, 4);

  const filename = 'deployed.json';
  await writeFileAsync(directory + filename, json, 'utf8');
  console.log('Wrote ' + filename);
}

run()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .then(() => process.exit(0));
