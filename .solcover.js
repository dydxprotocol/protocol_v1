module.exports = {
  testCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle test --network coverage',
  compileCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle compile --network coverage',
  copyPackages: ['zeppelin-solidity'],
<<<<<<< HEAD
<<<<<<< HEAD
  skipFiles: ['external/', 'testing/'],
  copyNodeModules: true
=======
  skipFiles: ['0x/', 'Kyber/' 'ZeroExExchangeInterface.sol', 'testing/']
>>>>>>> fix READMEs, solidity version
=======
  skipFiles: ['0x/', 'Kyber/', 'ZeroExExchangeInterface.sol', 'testing/']
>>>>>>> added some documentation fixed solcover
};
