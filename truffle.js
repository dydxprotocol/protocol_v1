require("babel-register");
require('babel-polyfill');

let mocha = {
  useColors: true
};

if (process.env.CIRCLE_SHA1) {
  mocha = {
    reporter: 'mocha-junit-reporter',
    reporterOptions: {
      mochaFile: './junit/test-results.xml'
    }
  };
}

module.exports = {
  networks: {
    kovan: {
      host: "localhost",
      port: 8545,
      network_id: "*",
      gas:4700000
    },
    dev: {
      host: "localhost",
      port: 8545,
      network_id: "*"
    },
    coverage: {
      host: 'localhost',
      network_id: '*',
      port: 8555,
      gas: 0xfffffffffff,
      gasPrice: 0x01,
    },
    docker: {
      host: 'localhost',
      network_id: '1212',
      port: 8545,
    }
  },
  mocha,
  solc: {
    optimizer: {
      enabled: true,
      runs: 10000
    }
  }
};
