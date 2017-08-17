require("babel-register");
require('babel-polyfill');

module.exports = {
  networks: {
    development: {
      host: "localhost",
      port: 8545,
      network_id: "*"
    },
    kovan: {
      host: "localhost",
      port: 8545,
      network_id: "*",
      gas:4700000
    }
  },
  mocha: {
    useColors: true,
  }
};
