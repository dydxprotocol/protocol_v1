/*global web3*/

const promisify = require("es6-promisify");

async function getBlockNumber(transactionHash) {
  const transaction = await promisify(web3.eth.getTransaction)(transactionHash);
  return transaction.blockNumber;
}

async function getBlockTimestamp(blockNumber) {
  const block = await promisify(web3.eth.getBlock)(blockNumber);
  return block.timestamp;
}

module.exports = {
  getBlockNumber,
  getBlockTimestamp
};
