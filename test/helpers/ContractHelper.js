const { wait } = require('@digix/tempo')(web3);

/**
 * Calls a solidity function and returns the return value.
 * @param  {SolidityFunction} contractFunction the function of the contract to call
 * @return {var} the return value of the solidity function if it doesn't revert
 */
async function transact(contractFunction /* , ... */) {
  // force a block to be mined. Helps the #call function be more accurate.
  await wait(1);

  const restOfArgs = [].slice.call(arguments).slice(1);
  const retValue =
    await contractFunction.call.apply(null, restOfArgs);
  const tx =
    await contractFunction.apply(null, restOfArgs);
  tx.result = retValue;
  return tx;
}

module.exports = {
  transact
};
