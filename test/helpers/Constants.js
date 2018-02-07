const BigNumber = require('bignumber.js');

module.exports = {
  zeroAddr: '0x0000000000000000000000000000000000000000',
  addr1: '0xec37D2aFfb54cBFaE6f8e66E0161E1cfa4bBf471',
  addr2: '0xec37D2aFfb54cBFaE6f8e66E0161E1cfa4bBf472',
  zeroExFeeTokenConstant: '0x0000000000000000000000000000010',
  testAddrs: [
    '0x06012c8cf97bead5deae237070f9587f8e7a266d', // CryptoKittiesCore
    '0x06012c8cf97bead5deae237070f9587f8e7a2661',
    '0x06012c8cf97bead5deae237070f9587f8e7a2662',
    '0x06012c8cf97bead5deae237070f9587f8e7a2663',
    '0x06012c8cf97bead5deae237070f9587f8e7a2664',
    '0x06012c8cf97bead5deae237070f9587f8e7a2665',
    '0x06012c8cf97bead5deae237070f9587f8e7a2666',
    '0x06012c8cf97bead5deae237070f9587f8e7a2667',
  ],
  BIGNUMBERS: {
    ZERO: new BigNumber(0),
    ONE_DAY_IN_SECONDS: new BigNumber(60 * 60 * 24)
  }
};
