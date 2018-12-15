const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const OasisV2SimpleExchangeWrapper = artifacts.require("OasisV2SimpleExchangeWrapper");
const TokenA = artifacts.require("TokenA");
const TokenB = artifacts.require("TokenB");
const TokenC = artifacts.require("TokenC");
const { MatchingMarketV2 } = require('../../../../contracts/OasisDex');

const { BIGNUMBERS, BYTES } = require('../../../../helpers/Constants');
const { toBytes32 } = require('../../../../helpers/BytesHelper');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const { transact } = require('../../../../helpers/ContractHelper');

function orderIdToBytes(orderId) {
  return web3Instance.utils.bytesToHex([].concat(toBytes32(orderId)));
}

contract('OasisV2SimpleExchangeWrapper', accounts => {
  let DAI, WETH, TEST, OasisDEX, SMEW;
  const DAI_PER_WETH = 400;
  const MAKER_WETH_AMOUNT = new BigNumber("1e24");
  const MAKER_DAI_AMOUNT = MAKER_WETH_AMOUNT.times(DAI_PER_WETH);
  let wethToDaiId, daiToWethId, testToWethId;

  beforeEach('Sets up OasisDEX', async () => {
    const OASIS_DEX_CLOSE_TIME = 1000000000000000;
    [
      DAI,
      WETH,
      TEST,
      OasisDEX
    ] = await Promise.all([
      TokenA.new(),
      TokenB.new(),
      TokenC.new(),
      MatchingMarketV2.new(OASIS_DEX_CLOSE_TIME)
    ]);
    SMEW = await OasisV2SimpleExchangeWrapper.new(OasisDEX.address);

    // set up makers
    const maker = accounts[9];

    await Promise.all([
      DAI.issueTo(maker, MAKER_DAI_AMOUNT),
      WETH.issueTo(maker, MAKER_WETH_AMOUNT.times(2)),
      TEST.issueTo(maker, MAKER_WETH_AMOUNT),
      DAI.approve(OasisDEX.address, BIGNUMBERS.MAX_UINT256, { from: maker }),
      WETH.approve(OasisDEX.address, BIGNUMBERS.MAX_UINT256, { from: maker }),
      TEST.approve(OasisDEX.address, BIGNUMBERS.MAX_UINT256, { from: maker }),
    ]);

    // add orders
    wethToDaiId = await transact(
      OasisDEX.offer,
      MAKER_DAI_AMOUNT,
      DAI.address,
      MAKER_WETH_AMOUNT.times(1.1),
      WETH.address,
      0,
      { from: maker }
    );
    wethToDaiId = wethToDaiId.result;

    daiToWethId = await transact(
      OasisDEX.offer,
      MAKER_WETH_AMOUNT,
      WETH.address,
      MAKER_DAI_AMOUNT.times(1.1),
      DAI.address,
      0,
      { from: maker }
    );
    daiToWethId = daiToWethId.result;

    testToWethId = await transact(
      OasisDEX.offer,
      MAKER_WETH_AMOUNT,
      WETH.address,
      MAKER_WETH_AMOUNT,
      TEST.address,
      0,
      { from: maker }
    );
    testToWethId = testToWethId.result;
  });

  describe('constructor', () => {
    it('sets constants correctly', async () => {
      const smAddress = await SMEW.SIMPLE_MARKET.call();
      expect(smAddress).to.be.eq(OasisDEX.address);
    });
  });

  describe('#getExchangeCost', () => {
    it('succeeds for valid orders', async () => {
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
        SMEW.getExchangeCost.call(
          DAI.address,
          WETH.address,
          amount,
          orderIdToBytes(wethToDaiId)
        ),
        OasisDEX.getPayAmount.call(
          DAI.address,
          WETH.address,
          amount
        ),
        SMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          orderIdToBytes(daiToWethId)
        ),
      ]);
      expect(direct1).to.be.bignumber.eq(result1);
      expect(direct2).to.be.bignumber.eq(result2);
    });

    it('fails for zero amount', async () => {
      const amount = new BigNumber("0");
      await expectThrow(
        SMEW.getExchangeCost.call(
          DAI.address,
          WETH.address,
          amount,
          orderIdToBytes(wethToDaiId)
        )
      );
    });

    it('fails for zero spend amount', async () => {
      const amount = new BigNumber("2");
      await expectThrow(
        SMEW.getExchangeCost.call(
          DAI.address,
          WETH.address,
          amount,
          orderIdToBytes(wethToDaiId)
        )
      );
    });

    it('fails for wrong order', async () => {
      const amount = new BigNumber("1e18");
      await expectThrow(
        SMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          orderIdToBytes(testToWethId)
        )
      );
      await expectThrow(
        SMEW.getExchangeCost.call(
          DAI.address,
          WETH.address,
          amount,
          orderIdToBytes(testToWethId)
        )
      );
    });

    it('fails for non-existent order', async () => {
      const amount = new BigNumber("1e18");
      const order = new BigNumber(10);
      await expectThrow(
        SMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          orderIdToBytes(order)
        )
      );
    });

    it('fails for too-small order', async () => {
      const amount = new BigNumber("1e36");
      await expectThrow(
        SMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          orderIdToBytes(daiToWethId)
        )
      );
    });

    it('fails for improperly-formatted order', async () => {
      const amount = new BigNumber("1e18");
      await expectThrow(
        SMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          BYTES.BAD_SIGNATURE
        )
      );
    });
  });

  describe('#exchange', () => {
    it('succeeds twice', async () => {
      const amount = new BigNumber("1e18");
      const expectedResult = await OasisDEX.getBuyAmount.call(WETH.address, DAI.address, amount);

      // exchange once
      await DAI.issueTo(SMEW.address, amount);
      const receipt1 = await transact(
        SMEW.exchange,
        accounts[0],
        accounts[0],
        WETH.address,
        DAI.address,
        amount,
        orderIdToBytes(daiToWethId)
      );

      // exchange again
      await DAI.issueTo(SMEW.address, amount);
      const receipt2 = await transact(
        SMEW.exchange,
        accounts[0],
        accounts[0],
        WETH.address,
        DAI.address,
        amount,
        orderIdToBytes(daiToWethId)
      );

      // check return values
      expect(receipt1.result).to.be.bignumber.eq(expectedResult);
      expect(receipt2.result).to.be.bignumber.eq(expectedResult);
    });

    it('succeeds for no rounding-error', async () => {
      const amount = MAKER_WETH_AMOUNT;
      const expectedResult = await OasisDEX.getBuyAmount.call(WETH.address, TEST.address, amount);
      await TEST.issueTo(SMEW.address, amount);
      const receipt1 = await transact(
        SMEW.exchange,
        accounts[0],
        accounts[0],
        WETH.address,
        TEST.address,
        amount,
        orderIdToBytes(testToWethId)
      );
      expect(receipt1.result).to.be.bignumber.eq(expectedResult);
    });

    it('fails when trying to take too much', async () => {
      const amount = new BigNumber("1e36");
      await DAI.issueTo(SMEW.address, amount);
      await expectThrow(
        SMEW.exchange(
          accounts[0],
          accounts[0],
          WETH.address,
          DAI.address,
          amount,
          orderIdToBytes(daiToWethId)
        )
      );
    });

    it('fails when trying to take zero', async () => {
      const amount = new BigNumber("0");
      await expectThrow(
        SMEW.exchange(
          accounts[0],
          accounts[0],
          WETH.address,
          DAI.address,
          amount,
          orderIdToBytes(daiToWethId)
        )
      );
    });

    it('fails for wrong order', async () => {
      const amount = new BigNumber("1e18");
      await DAI.issueTo(SMEW.address, amount);

      await expectThrow(
        SMEW.exchange(
          accounts[0],
          accounts[0],
          WETH.address,
          DAI.address,
          amount,
          orderIdToBytes(wethToDaiId),
        )
      );

      await expectThrow(
        SMEW.exchange(
          accounts[0],
          accounts[0],
          DAI.address,
          WETH.address,
          amount,
          orderIdToBytes(daiToWethId)
        )
      );
    });
  });

  describe('#getMaxMakerAmount', () => {
    it('succeeds', async () => {
      const result1 = await SMEW.getMaxMakerAmount.call(
        WETH.address,
        DAI.address,
        orderIdToBytes(daiToWethId)
      );
      expect(result1).to.be.bignumber.eq(MAKER_WETH_AMOUNT);

      const result2 = await SMEW.getMaxMakerAmount.call(
        DAI.address,
        WETH.address,
        orderIdToBytes(wethToDaiId)
      );
      expect(result2).to.be.bignumber.eq(MAKER_DAI_AMOUNT);
    });

    it('fails for incorrect order', async () => {
      await expectThrow(
        SMEW.getMaxMakerAmount.call(
          DAI.address,
          WETH.address,
          orderIdToBytes(daiToWethId)
        )
      );

      await expectThrow(
        SMEW.getMaxMakerAmount.call(
          WETH.address,
          DAI.address,
          orderIdToBytes(wethToDaiId)
        )
      );
    });
  });
});
