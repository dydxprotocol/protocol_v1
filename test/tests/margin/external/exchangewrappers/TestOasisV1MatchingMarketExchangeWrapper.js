const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const OasisV1MatchingExchangeWrapper = artifacts.require("OasisV1MatchingExchangeWrapper");
const TokenA = artifacts.require("TokenA");
const TokenB = artifacts.require("TokenB");
const { MatchingMarketV1 } = require('../../../../contracts/OasisDex');

const { BIGNUMBERS, BYTES } = require('../../../../helpers/Constants');
const { toBytes32 } = require('../../../../helpers/BytesHelper');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const { transact } = require('../../../../helpers/ContractHelper');

function priceToBytes(num, den) {
  return web3Instance.utils.bytesToHex([]
    .concat(toBytes32(new BigNumber(num)))
    .concat(toBytes32(new BigNumber(den)))
  );
}

contract('OasisV1MatchingExchangeWrapper', accounts => {
  let DAI, WETH, OasisDEX, MMEW;
  const DAI_PER_WETH = 400;
  const MAKER_WETH_AMOUNT = new BigNumber("1e24");
  const MAKER_DAI_AMOUNT = MAKER_WETH_AMOUNT.times(DAI_PER_WETH);

  beforeEach('Sets up OasisDEX', async () => {
    const OASIS_DEX_CLOSE_TIME = 1000000000000000;
    [
      DAI,
      WETH,
      OasisDEX
    ] = await Promise.all([
      TokenA.new(),
      TokenB.new(),
      MatchingMarketV1.new(OASIS_DEX_CLOSE_TIME)
    ]);
    MMEW = await OasisV1MatchingExchangeWrapper.new(OasisDEX.address);

    // set up makers
    const maker = accounts[9];

    await Promise.all([
      OasisDEX.addTokenPairWhitelist(WETH.address, DAI.address),
      DAI.issueTo(maker, MAKER_DAI_AMOUNT.times(2)),
      WETH.issueTo(maker, MAKER_WETH_AMOUNT.times(2)),
      DAI.approve(OasisDEX.address, BIGNUMBERS.MAX_UINT256, { from: maker }),
      WETH.approve(OasisDEX.address, BIGNUMBERS.MAX_UINT256, { from: maker }),
    ]);

    await Promise.all([
      // Offers to sell DAI for WETH
      OasisDEX.offer(
        MAKER_DAI_AMOUNT,
        DAI.address,
        MAKER_WETH_AMOUNT.times(1.1),
        WETH.address,
        0,
        { from: maker }
      ),
      OasisDEX.offer(
        MAKER_DAI_AMOUNT,
        DAI.address,
        MAKER_WETH_AMOUNT.times(1.5),
        WETH.address,
        0,
        { from: maker }
      ),

      // Offers to sell WETH for DAI
      OasisDEX.offer(
        MAKER_WETH_AMOUNT,
        WETH.address,
        MAKER_DAI_AMOUNT.times(1.1),
        DAI.address,
        0,
        { from: maker }
      ),
      OasisDEX.offer(
        MAKER_WETH_AMOUNT,
        WETH.address,
        MAKER_DAI_AMOUNT.times(1.5),
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
      let price1 = priceToBytes("1e10", "1e1");
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

    it('fails for takerAmount > 128 bits', async () => {
      const amount = new BigNumber("1e18");
      let price1 = priceToBytes("1e40", "1e10");
      await expectThrow(
        MMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          price1
        )
      );
    });

    it('fails for makerAmount > 128 bits', async () => {
      const amount = new BigNumber("1e18");
      let price1 = priceToBytes("1e10", "1e40");
      await expectThrow(
        MMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          price1
        )
      );
    });

    it('fails for low maximum price', async () => {
      const amount = new BigNumber("1e18");
      let price1 = priceToBytes("1", "1e10");
      await expectThrow(
        MMEW.getExchangeCost.call(
          WETH.address,
          DAI.address,
          amount,
          price1
        )
      );
    });

    it('fails for zero makerAmount (infinite max price)', async () => {
      const amount = new BigNumber("1e18");
      let price1 = priceToBytes("1e10", "0");
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
    it('succeeds twice', async () => {
      const amount = new BigNumber("1e18");
      const expectedResult = await OasisDEX.getBuyAmount.call(WETH.address, DAI.address, amount);

      // exchange once
      await DAI.issueTo(MMEW.address, amount);
      const receipt1 = await transact(
        MMEW.exchange,
        accounts[0],
        accounts[0],
        WETH.address,
        DAI.address,
        amount,
        BYTES.EMPTY
      );

      // exchange again
      await DAI.issueTo(MMEW.address, amount);
      const receipt2 = await transact(
        MMEW.exchange,
        accounts[0],
        accounts[0],
        WETH.address,
        DAI.address,
        amount,
        BYTES.EMPTY
      );

      // check return values
      expect(receipt1.result).to.be.bignumber.eq(expectedResult);
      expect(receipt2.result).to.be.bignumber.eq(expectedResult);
    });

    it('fails for low maximum price', async () => {
      const amount = new BigNumber("1e18");
      let price = priceToBytes("1", "1e10");
      await DAI.issueTo(MMEW.address, amount);

      await expectThrow(
        MMEW.exchange(
          accounts[0],
          accounts[0],
          WETH.address,
          DAI.address,
          amount,
          price
        )
      );
    });
  });

  describe('#getMaxMakerAmount', () => {
    it('succeeds for obtaining makerToken = WETH', async () => {
      let result;

      result = await MMEW.getMaxMakerAmount.call(
        WETH.address,
        DAI.address,
        priceToBytes("1", "1e10")
      );
      expect(result).to.be.bignumber.eq(0);

      result = await MMEW.getMaxMakerAmount.call(
        WETH.address,
        DAI.address,
        priceToBytes("440", "1")
      );
      expect(result).to.be.bignumber.eq(MAKER_WETH_AMOUNT);

      result = await MMEW.getMaxMakerAmount.call(
        WETH.address,
        DAI.address,
        priceToBytes("1e10", "1e1")
      );
      expect(result).to.be.bignumber.eq(MAKER_WETH_AMOUNT.times(2));
    });

    it('succeeds for obtaining makerToken = DAI', async () => {
      let result;

      result = await MMEW.getMaxMakerAmount.call(
        DAI.address,
        WETH.address,
        priceToBytes("1", "1e10")
      );
      expect(result).to.be.bignumber.eq(0);

      result = await MMEW.getMaxMakerAmount.call(
        DAI.address,
        WETH.address,
        priceToBytes("1", "360")
      );
      expect(result).to.be.bignumber.eq(MAKER_DAI_AMOUNT);

      result = await MMEW.getMaxMakerAmount.call(
        DAI.address,
        WETH.address,
        priceToBytes("1e10", "1e1")
      );
      expect(result).to.be.bignumber.eq(MAKER_DAI_AMOUNT.times(2));
    });

    it('fails for zero maxPrice', async () => {
      await expectThrow(
        MMEW.getMaxMakerAmount.call(
          DAI.address,
          WETH.address,
          priceToBytes("1", "0")
        )
      );
    });

    it('fails for no maxPrice', async () => {
      await expectThrow(
        MMEW.getMaxMakerAmount.call(
          DAI.address,
          WETH.address,
          BYTES.EMPTY
        )
      );
    });
  });
});
