const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const BucketLender = artifacts.require("BucketLender");
const BucketLenderFactory = artifacts.require("BucketLenderFactory");

const { transact } = require('../../../../helpers/ContractHelper');
const { ADDRESSES, BYTES32 } = require('../../../../helpers/Constants');

contract('BucketLenderFactory', () => {

  // ============ Before/After ============

  beforeEach('set up contracts', async () => {
  });

  // ============ Constructor ============

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const marginAddress = ADDRESSES.TEST[0];
      const factory = await BucketLenderFactory.new(marginAddress);
      const dydxMargin = await factory.DYDX_MARGIN.call();
      expect(dydxMargin).to.be.eq(marginAddress);
    });
  });

  // ============ Functions ============

  describe('#createBucketLender', () => {
    it('succeeds', async () => {
      const positionId = BYTES32.TEST[0];
      const bucketTime = new BigNumber(123);
      const interestRate = new BigNumber(456);
      const interestPeriod = new BigNumber(789);
      const maxDuration = new BigNumber(101112);
      const callTimelimit = new BigNumber(131415);
      const numerator = new BigNumber(161718);
      const denominator = new BigNumber(192021);
      const marginCaller = ADDRESSES.TEST[0];
      const withdrawer = ADDRESSES.TEST[2];
      const bucketLenderOwner = ADDRESSES.TEST[3];

      const factory = await BucketLenderFactory.new(Margin.address);

      const newBucketLender = await transact(
        factory.createBucketLender,
        positionId,
        bucketLenderOwner,
        HeldToken.address,
        OwedToken.address,
        [
          bucketTime,
          interestRate,
          interestPeriod,
          maxDuration,
          callTimelimit,
          numerator,
          denominator
        ],
        [
          marginCaller
        ],
        [
          withdrawer
        ]
      );

      const bucketLender = await BucketLender.at(newBucketLender.result);

      const [
        bl_margin,
        bl_positionId,
        bl_heldToken,
        bl_owedToken,
        bl_bucketTime,
        bl_interestRate,
        bl_interestPeriod,
        bl_maxDuration,
        bl_callTimelimit,
        bl_numerator,
        bl_denominator,
        bl_marginCallerOkay,
        bl_notMarginCallerNotOkay,
        bl_withdrawerOkay,
        bl_notWithdrawerNotOkay,
        bl_owner,
      ] = await Promise.all([
        bucketLender.DYDX_MARGIN.call(),
        bucketLender.POSITION_ID.call(),
        bucketLender.HELD_TOKEN.call(),
        bucketLender.OWED_TOKEN.call(),
        bucketLender.BUCKET_TIME.call(),
        bucketLender.INTEREST_RATE.call(),
        bucketLender.INTEREST_PERIOD.call(),
        bucketLender.MAX_DURATION.call(),
        bucketLender.CALL_TIMELIMIT.call(),
        bucketLender.MIN_HELD_TOKEN_NUMERATOR.call(),
        bucketLender.MIN_HELD_TOKEN_DENOMINATOR.call(),
        bucketLender.TRUSTED_MARGIN_CALLERS.call(marginCaller),
        bucketLender.TRUSTED_MARGIN_CALLERS.call(withdrawer),
        bucketLender.TRUSTED_WITHDRAWERS.call(withdrawer),
        bucketLender.TRUSTED_WITHDRAWERS.call(marginCaller),
        bucketLender.owner.call(),
      ]);

      expect(bl_margin).to.be.eq(Margin.address);
      expect(bl_positionId).to.be.eq(positionId);
      expect(bl_heldToken).to.be.eq(HeldToken.address);
      expect(bl_owedToken).to.be.eq(OwedToken.address);
      expect(bl_bucketTime).to.be.bignumber.eq(bucketTime);
      expect(bl_interestRate).to.be.bignumber.eq(interestRate);
      expect(bl_interestPeriod).to.be.bignumber.eq(interestPeriod);
      expect(bl_maxDuration).to.be.bignumber.eq(maxDuration);
      expect(bl_callTimelimit).to.be.bignumber.eq(callTimelimit);
      expect(bl_numerator).to.be.bignumber.eq(numerator);
      expect(bl_denominator).to.be.bignumber.eq(denominator);
      expect(bl_marginCallerOkay).to.be.eq(true);
      expect(bl_notMarginCallerNotOkay).to.be.eq(false);
      expect(bl_withdrawerOkay).to.be.eq(true);
      expect(bl_notWithdrawerNotOkay).to.be.eq(false);
      expect(bl_owner).to.be.eq(bucketLenderOwner);
    });
  });
});
