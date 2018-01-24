/*global web3*/

const promisify = require("es6-promisify");

async function getBlockTimestamp(blockNumber) {
  const block = await promisify(web3.eth.getBlock)(blockNumber);
  return block.timestamp;
}

module.exports = {
  getBlockTimestamp
};
