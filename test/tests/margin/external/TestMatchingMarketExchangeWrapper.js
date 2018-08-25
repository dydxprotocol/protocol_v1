const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const MatchingMarket = artifacts.require("MatchingMarket");
const MatchingMarketExchangeWrapper = artifacts.require("MatchingMarketExchangeWrapper");
const TokenA = artifacts.require("TokenA");
const TokenB = artifacts.require("TokenB");

const { BIGNUMBERS, BYTES } = require('../../../helpers/Constants');
const { toBytes32 } = require('../../../helpers/BytesHelper');
const { expectThrow } = require('../../../helpers/ExpectHelper');


contract('MatchingMarketExchangeWrapper', accounts => {
  let DAI, WETH, OasisDEX, MMEW;
  const DAI_PER_WETH = 400;

  beforeEach('Sets up OasisDEX', async () => {
    const OASIS_DEX_CLOSE_TIME = 1000000000000000;
    [
      DAI,
      WETH,
      OasisDEX
    ] = await Promise.all([
      TokenA.new(),
      TokenB.new(),
      MatchingMarket.new(OASIS_DEX_CLOSE_TIME)
    ]);
    MMEW = await MatchingMarketExchangeWrapper.new(OasisDEX.address);

    // set up makers
    const maker = accounts[9];
    const MAKER_WETH_AMOUNT = new BigNumber("1e24");
    const MAKER_DAI_AMOUNT = MAKER_WETH_AMOUNT.times(DAI_PER_WETH);

    await Promise.all([
      OasisDEX.addTokenPairWhitelist(WETH.address, DAI.address),
      DAI.issueTo(maker, MAKER_DAI_AMOUNT),
      WETH.issueTo(maker, MAKER_WETH_AMOUNT),
      DAI.approve(OasisDEX.address, BIGNUMBERS.MAX_UINT256, { from: maker }),
      WETH.approve(OasisDEX.address, BIGNUMBERS.MAX_UINT256, { from: maker }),
    ]);

    await Promise.all([
      OasisDEX.offer(
        MAKER_DAI_AMOUNT,
        DAI.address,
        MAKER_WETH_AMOUNT.times(1.1),
        WETH.address,
        0,
        { from: maker }
      ),
      OasisDEX.offer(
        MAKER_WETH_AMOUNT,
        WETH.address,
        MAKER_DAI_AMOUNT.times(1.1),
        DAI.address,
        0,
        { from: maker }
      ),
    ]);
  });

  describe('constructor', () => {
    it('sets constants correctly', async () => {
      const mmAddress = await MMEW.MATCHING_MARKET.call();
      expect(mmAddress).to.be.eq(OasisDEX.address);
    });
  });

  describe('#getExchangeCost', () => {
    it('succeeds for no maximum price', async () => {
      const amount = new BigNumber("1e18");
      const [
        direct1,
        result1,
        direct2,
        result2
      ] = await Promise.all([
        OasisDEX.getPayAmount.call(
          WETH.address,
          DAI.address,
          amount
        ),
        MMEW.getExchangeCost.call(
          DAI.address,
          WETH.address,
          amount,
          BYTES.EMPTY
        ),
        OasisDEX.getPayAmount.call(
          DAI.address,
          WETH.address,
          amount
        ),
        MMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          BYTES.EMPTY
        ),
      ]);
      expect(direct1).to.be.bignumber.eq(result1);
      expect(direct2).to.be.bignumber.eq(result2);
    });

    it('succeeds for high maximum price', async () => {
      const amount = new BigNumber("1e18");
      let price1 = web3Instance.utils.bytesToHex([]
        .concat(toBytes32(new BigNumber("1e10")))
        .concat(toBytes32(new BigNumber("1e1")))
      );
      const [
        direct1,
        result1,
        direct2,
        result2
      ] = await Promise.all([
        OasisDEX.getPayAmount.call(
          WETH.address,
          DAI.address,
          amount
        ),
        MMEW.getExchangeCost.call(
          DAI.address,
          WETH.address,
          amount,
          price1
        ),
        OasisDEX.getPayAmount.call(
          DAI.address,
          WETH.address,
          amount
        ),
        MMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          price1
        ),
      ]);
      expect(direct1).to.be.bignumber.eq(result1);
      expect(direct2).to.be.bignumber.eq(result2);
    });

    it('fails for low maximum price', async () => {
      const amount = new BigNumber("1e18");
      let price1 = web3Instance.utils.bytesToHex([]
        .concat(toBytes32(new BigNumber("1e1")))
        .concat(toBytes32(new BigNumber("1e10")))
      );
      await expectThrow(
        MMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          price1
        )
      );
    });

    it('fails for zero maximum price', async () => {
      const amount = new BigNumber("1e18");
      let price1 = web3Instance.utils.bytesToHex([]
        .concat(toBytes32(new BigNumber("0")))
        .concat(toBytes32(new BigNumber("1e10")))
      );
      await expectThrow(
        MMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          price1
        )
      );
    });

    it('fails for improperly-formatted maximum price', async () => {
      const amount = new BigNumber("1e18");
      let price1 = web3Instance.utils.bytesToHex([]
        .concat(toBytes32(new BigNumber("1e1")))
        .concat(toBytes32(new BigNumber("1e10")))
        .concat(toBytes32(new BigNumber("1e100")))
      );
      await expectThrow(
        MMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          price1
        )
      );
    });
  });

  describe('#exchange', () => {
    //TODO
  });
});
