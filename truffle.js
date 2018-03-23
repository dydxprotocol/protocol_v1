require("babel-register");
require('babel-polyfill');

module.exports = {
  networks: {
    kovan: {
      host: "localhost",
      port: 8545,
      network_id: "*",
      gas:4700000
    },
    development: {
      host: "localhost",
      port: 9545,
      network_id: "*",
      gasLimit: 6721975,
      gasPrice: 0
    },
    coverage: {
      host: 'localhost',
      network_id: '*', // eslint-disable-line camelcase
      port: 8555,
      gas: 0xfffffffffff,
      gasPrice: 0x01,
    }
  },
  mocha: {
    useColors: true,
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 10000
    }
  }
};
