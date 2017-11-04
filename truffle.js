require("babel-register");
require('babel-polyfill');

module.exports = {
  networks: {
    kovan: {
      host: "localhost",
      port: 8545,
      network_id: "*",
      gas:4700000
    }
  },
  mocha: {
    useColors: true,
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  }
};
