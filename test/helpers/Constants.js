const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
const BigNumber = require('bignumber.js');

module.exports = {
  SIGNATURE_TYPE: {
    INVALID: 0,
    UNSUPPORTED: 3,
    UNSUPPORTED_LARGE: 15,
    DEC: 1,
    HEX: 2,
  },
  ORDER_TYPE: {
    ZERO_EX_V1: "zeroExV1",
    ZERO_EX_V2: "zeroExV2",
    DIRECT: "openDirectly"
  },
  POSITION_TYPE: {
    SHORT: 'SHORT',
    LONG: 'LONG',
  },
  addr1: '0xec37D2aFfb54cBFaE6f8e66E0161E1cfa4bBf471',
  addr2: '0xec37D2aFfb54cBFaE6f8e66E0161E1cfa4bBf472',
  ADDRESSES: {
    ZERO: '0x0000000000000000000000000000000000000000',
    ONE: '0x0000000000000000000000000000000000000001',
    TEST: [
      '0x06012c8cf97bead5deae237070f9587f8e7a266d', // CryptoKittiesCore
      '0x06012c8cf97bead5deae237070f9587f8e7a2661', // 1
      '0x06012c8cf97bead5deae237070f9587f8e7a2662', // 2
      '0x06012c8cf97bead5deae237070f9587f8e7a2663', // 3
      '0x06012c8cf97bead5deae237070f9587f8e7a2664', // 4
      '0x06012c8cf97bead5deae237070f9587f8e7a2665', // 5
      '0x06012c8cf97bead5deae237070f9587f8e7a2666', // 6
      '0x06012c8cf97bead5deae237070f9587f8e7a2667', // 7
      '0x06012c8cf97bead5deae237070f9587f8e7a2668', // 8
      '0x06012c8cf97bead5deae237070f9587f8e7a2669', // 9
    ]
  },
  BIGNUMBERS: {
    ZERO: new BigNumber(0),
    ONE_DAY_IN_SECONDS: new BigNumber(60 * 60 * 24),
    ONE_YEAR_IN_SECONDS: new BigNumber(60 * 60 * 24 * 365),
    MAX_UINT32: new BigNumber("4294967295"), // 2**32-1
    MAX_UINT64: new BigNumber("18446744073709551615"), // 2**64-1
    MAX_UINT128: new BigNumber("340282366920938463463374607431768211455"), // 2**128-1
    MAX_UINT256: new BigNumber(
      "115792089237316195423570985008687907853269984665640564039457584007913129639935"), // 2**256-1
  },
  BYTES32: {
    ZERO: '0x0000000000000000000000000000000000000000000000000000000000000000'.valueOf(),
    BAD_ID: web3Instance.utils.utf8ToHex("XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"),
    TEST: [
      web3Instance.utils.utf8ToHex("12345670123456701234567012345670"),
      web3Instance.utils.utf8ToHex("12345671123456711234567112345671"),
      web3Instance.utils.utf8ToHex("12345672123456721234567212345672"),
      web3Instance.utils.utf8ToHex("12345673123456731234567312345673"),
      web3Instance.utils.utf8ToHex("12345674123456741234567412345674"),
      web3Instance.utils.utf8ToHex("12345675123456751234567512345675"),
      web3Instance.utils.utf8ToHex("12345676123456761234567612345676"),
      web3Instance.utils.utf8ToHex("12345677123456771234567712345677"),
      web3Instance.utils.utf8ToHex("12345678123456781234567812345678"),
      web3Instance.utils.utf8ToHex("12345679123456791234567912345679"),
    ]
  },
  BYTES: {
    EMPTY: web3Instance.utils.utf8ToHex(""),
    BAD_SIGNATURE: web3Instance.utils.utf8ToHex(
      "12345670123456701234567012345670" +
      "12345670123456701234567012345670" +
      "12345670123456701234567012345670"
    ),
  },
  DEFAULT_SALT: 425
};
