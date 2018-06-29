const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const WETH9 = artifacts.require("WETH9");
const BucketLender = artifacts.require("BucketLender");
const EthWrapperForBucketLender = artifacts.require("EthWrapperForBucketLender");

const { transact } = require('../../../helpers/ContractHelper');
const { BIGNUMBERS } = require('../../../helpers/Constants');
const { expectThrow } = require('../../../helpers/ExpectHelper');

let heldToken, weth, bucketLender, ethWrapper;
const value = new BigNumber('1e10');
const INTEREST_PERIOD = new BigNumber(60 * 60);
const INTEREST_RATE = new BigNumber(10 * 1000000);
const MAX_DURATION = new BigNumber(60 * 60 * 24 * 365);
const CALL_TIMELIMIT = new BigNumber(60 * 60 * 24);
const BUCKET_TIME = new BigNumber(60 * 60 * 24);
const PRINCIPAL = new BigNumber('1e18');
const DEPOSIT = PRINCIPAL.times(2);
let POSITION_ID;

contract('BucketLender', accounts => {

  // ============ Before ============

  beforeEach('Set up contracts', async () => {
    [
      heldToken,
      weth,
    ] = await Promise.all([
      HeldToken.new(),
      WETH9.new(),
    ]);

    [
      ethWrapper,
      bucketLender
    ] = await Promise.all([
      EthWrapperForBucketLender.new(
        weth.address
      ),
      BucketLender.new(
        Margin.address,
        POSITION_ID,
        heldToken.address,
        weth.address,
        [
          BUCKET_TIME,
          INTEREST_RATE,
          INTEREST_PERIOD,
          MAX_DURATION,
          CALL_TIMELIMIT,
          DEPOSIT, // MIN_HELD_TOKEN_NUMERATOR,
          PRINCIPAL, // MIN_HELD_TOKEN_DENOMINATOR,
        ],
        [] // trusted margin-callers
      )
    ]);
  });

  // ============ Constructor ============

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const c_weth = await ethWrapper.WETH.call();
      expect(c_weth).to.eq(weth.address);
    });
  });

  describe('Fallback Function', () => {
    it('fails', async () => {
      await expectThrow(ethWrapper.send(value));
    });
  });

  describe('#depositEth', () => {
    it('succeeds when depositing multiple times', async () => {
      const sender = accounts[1];
      const beneficiary = accounts[2];
      let result;

      result = await transact(
        ethWrapper.depositEth,
        bucketLender.address,
        beneficiary,
        { from: sender, value: value }
      );
      expect(result.result).to.be.bignumber.eq(0); // expect bucket 0

      result = await transact(
        ethWrapper.depositEth,
        bucketLender.address,
        beneficiary,
        { from: sender, value: value }
      );
      expect(result.result).to.be.bignumber.eq(0); // expect bucket 0

      const [
        weight1,
        weight2
      ] = await Promise.all([
        bucketLender.weightForBucket.call(0),
        bucketLender.weightForBucketForAccount.call(0, beneficiary),
      ]);
      expect(weight1).to.be.bignumber.eq(value.times(2));
      expect(weight2).to.be.bignumber.eq(value.times(2));
    });

    it('fails for zero amount', async () => {
      const sender = accounts[1];
      const beneficiary = accounts[2];
      await expectThrow(ethWrapper.depositEth(
        bucketLender.address,
        beneficiary,
        { from: sender, value: BIGNUMBERS.ZERO }
      ));
    });

    it('fails for bad bucketLender address', async () => {
      const sender = accounts[1];
      const beneficiary = accounts[2];
      await expectThrow(ethWrapper.depositEth(
        Margin.address,
        beneficiary,
        { from: sender, value: value }
      ));
      await expectThrow(ethWrapper.depositEth(
        sender,
        beneficiary,
        { from: sender, value: value }
      ));
    });
  });
});
