module.exports = {
  transact
};

/**
 * Calls a solidity function and returns the return value.
 * @param  {SolidityFunction} contractFunction the function of the contract to call
 * @return {var} the return value of the solidity function if it doesn't revert
 */
async function transact(contractFunction /* , ... */){
  const restOfArgs = [].slice.call(arguments).slice(1);
  const retValue =
    await contractFunction.call.apply(null, restOfArgs);
  const tx =
    await contractFunction.apply(null, restOfArgs);
  tx.result = retValue;
  return tx;
}
