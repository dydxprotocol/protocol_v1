import promisify from 'es6-promisify';

export async function getBlockNumber(transactionHash) {
  const transaction = await promisify(web3.eth.getTransaction)(transactionHash);
  return transaction.blockNumber;
}

export async function getGasCost(transactionHash) {
  const transaction = await promisify(web3.eth.getTransactionReceipt)(transactionHash);
  return transaction.gasUsed;
}

export async function getBlockTimestamp(blockNumber) {
  const block = await promisify(web3.eth.getBlock)(blockNumber);
  return block.timestamp;
}
