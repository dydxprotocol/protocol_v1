module.exports = {
  testCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle test --network coverage',
  compileCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle compile --network coverage',
  copyPackages: ['openzeppelin-solidity'],
  skipFiles: ['0x/', 'ZeroExExchangeInterface.sol', 'testing/']
};
