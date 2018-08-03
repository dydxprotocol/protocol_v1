const { wait } = require('@digix/tempo')(web3);

/**
 * Calls a solidity function and returns the return value.
 * @param  {SolidityFunction} contractFunction the function of the contract to call
 * @return {var} the return value of the solidity function if it doesn't revert
 */
export async function transact(contractFunction, ...args) {
  // force a block to be mined. Helps the #call function be more accurate.
  await wait(1);

  const retValue = await contractFunction.call(...args);
  const tx = await contractFunction(...args);
  tx.result = retValue;
  return tx;
}
