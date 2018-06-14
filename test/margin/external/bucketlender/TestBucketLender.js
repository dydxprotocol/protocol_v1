const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const TestBucketLender = artifacts.require("TestBucketLender");
const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const OpenDirectlyExchangeWrapper = artifacts.require("OpenDirectlyExchangeWrapper");

const { transact } = require('../../../helpers/ContractHelper');
const { ADDRESSES, BIGNUMBERS, BYTES, ORDER_TYPE } = require('../../../helpers/Constants');
const { expectThrow } = require('../../../helpers/ExpectHelper');
const { issueAndSetAllowance } = require('../../../helpers/TokenHelper');
const {
  issueTokenToAccountInAmountAndApproveProxy,
  callIncreasePosition
} = require('../../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

const OT = new BigNumber('1e18');

const web3Instance = new Web3(web3.currentProvider);

const INTEREST_PERIOD = new BigNumber(60 * 60);
const INTEREST_RATE = new BigNumber(10 * 1000000);
const MAX_DURATION = new BigNumber(60 * 60 * 24 * 365);
const CALL_TIMELIMIT = new BigNumber(60 * 60 * 24);
const BUCKET_TIME = new BigNumber(60 * 60 * 24);
let POSITION_ID;

let margin, heldToken, owedToken;
let bucketLender;
let lender1, lender2, uselessLender, trader, alice;

// grants tokens to a lender and has them deposit them into the bucket lender
async function doDeposit(account, amount) {
  console.log("    depositing...");
  await issueAndSetAllowance(owedToken, account, amount, bucketLender.address);
  console.log("    ...");
  await bucketLender.deposit(account, amount, { from: account });
  console.log("done.");
}

// withdraws for a bucket from an account
async function doWithdraw(account, bucket) {
  const tx = await transact(
    bucketLender.withdraw,
    [bucket],
    [BIGNUMBERS.ONES_255],
    account,
    { from: account }
  );
  const [owedWithdrawn, heldWithdrawn] = tx.result;
  const remainingWeight = await bucketLender.weightForBucketForAccount.call(bucket, account);
  return {owedWithdrawn, heldWithdrawn, remainingWeight};
}

async function runAliceBot() {
  const aliceAmount = OT;
  console.log("  runnning alice bot...");
  console.log("    checking invariants...");
  await bucketLender.checkInvariants();
  console.log("    depositing...");
  await issueAndSetAllowance(owedToken, alice, aliceAmount, bucketLender.address);
  const bucket = await transact(bucketLender.deposit, alice, aliceAmount, { from: alice });
  console.log("    withdrawing (bucket " + bucket.result.toString() + ")...");
  const { owedWithdrawn, heldWithdrawn, remainingWeight } = await doWithdraw(alice, bucket.result);
  expect(owedWithdrawn).to.be.bignumber.lte(aliceAmount);
  expect(owedWithdrawn.plus(1)).to.bignumber.gte(aliceAmount);
  expect(heldWithdrawn).to.be.bignumber.eq(0);
  expect(remainingWeight).to.be.bignumber.eq(0);
  console.log("    checking invariants...");
  await bucketLender.checkInvariants();
  console.log("  done.");
}

async function setUpPosition(accounts) {
  [
    lender1,
    lender2,
    uselessLender,
    trader,
    alice
  ] = [
    accounts[5],
    accounts[6],
    accounts[7],
    accounts[8],
    accounts[9],
  ];

  const nonce = Math.floor(Math.random() * 12983748912748);
  POSITION_ID = web3Instance.utils.soliditySha3(accounts[0], nonce);

  const principal = new BigNumber('22e18');
  const deposit = new BigNumber('60e18');

  bucketLender = await TestBucketLender.new(
    Margin.address,
    POSITION_ID,
    heldToken.address,
    owedToken.address,
    BUCKET_TIME,
    INTEREST_RATE,
    INTEREST_PERIOD,
    MAX_DURATION,
    CALL_TIMELIMIT,
    deposit, // MIN_HELD_TOKEN_NUMERATOR,
    principal, // MIN_HELD_TOKEN_DENOMINATOR,
    [accounts[0]] // trusted margin-callers
  );

  await Promise.all([
    issueTokenToAccountInAmountAndApproveProxy(heldToken, accounts[0], deposit),
    doDeposit(lender1, OT.times(2)),
    doDeposit(lender2, OT.times(3)),
  ]);

  await margin.openWithoutCounterparty(
    [
      ERC20ShortCreator.address,
      owedToken.address,
      heldToken.address,
      bucketLender.address
    ],
    [
      principal,
      deposit,
      nonce
    ],
    [
      CALL_TIMELIMIT,
      MAX_DURATION,
      INTEREST_RATE,
      INTEREST_PERIOD
    ]
  );
}

contract('BucketLender', accounts => {

  // ============ Before ============

  beforeEach('Set up contracts', async () => {
    [
      margin,
      heldToken,
      owedToken
    ] = await Promise.all([
      Margin.deployed(),
      HeldToken.new(),
      OwedToken.new(),
    ]);

    await setUpPosition(accounts);
  });

  // ============ Constructor ============

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const [
        c_margin,
        c_owedToken,
        c_heldToken,
        c_bucketTime,
        c_positionId,
        c_isTrusted,
        c_isTrusted2,

        c_wasForceClosed,
        c_criticalBucket,
        c_cachedRepaidAmount,

        c_available,
        c_available2,
        c_available3,
        c_principal,
        c_principal2,
        c_weight,
        c_weight2,

        principal,

        bucketLenderOwedToken,
        bucketLenderHeldToken,
      ] = await Promise.all([
        bucketLender.DYDX_MARGIN.call(),
        bucketLender.OWED_TOKEN.call(),
        bucketLender.HELD_TOKEN.call(),
        bucketLender.BUCKET_TIME.call(),
        bucketLender.POSITION_ID.call(),
        bucketLender.TRUSTED_MARGIN_CALLERS.call(accounts[0]),
        bucketLender.TRUSTED_MARGIN_CALLERS.call(accounts[1]),

        bucketLender.wasForceClosed.call(),
        bucketLender.criticalBucket.call(),
        bucketLender.cachedRepaidAmount.call(),

        bucketLender.availableTotal.call(),
        bucketLender.availableForBucket.call(0),
        bucketLender.availableForBucket.call(1),
        bucketLender.principalTotal.call(),
        bucketLender.principalForBucket.call(0),
        bucketLender.weightForBucket.call(0),
        bucketLender.weightForBucketForAccount.call(0, accounts[0]),

        margin.getPositionPrincipal.call(POSITION_ID),

        owedToken.balanceOf.call(bucketLender.address),
        heldToken.balanceOf.call(bucketLender.address),
      ]);

      expect(c_margin).to.eq(Margin.address);
      expect(c_owedToken).to.eq(owedToken.address);
      expect(c_heldToken).to.eq(heldToken.address);
      expect(c_bucketTime).to.be.bignumber.eq(BUCKET_TIME);
      expect(c_positionId).to.eq(POSITION_ID);
      expect(c_isTrusted).to.be.true;
      expect(c_isTrusted2).to.be.false;

      expect(c_wasForceClosed).to.be.false;
      expect(c_criticalBucket).to.be.bignumber.eq(0);
      expect(c_cachedRepaidAmount).to.be.bignumber.eq(0);

      expect(c_available).to.be.bignumber.eq(bucketLenderOwedToken);
      expect(c_available2).to.be.bignumber.eq(c_available);
      expect(c_available3).to.be.bignumber.eq(0);
      expect(c_principal).to.be.bignumber.eq(principal);
      expect(c_principal).to.be.bignumber.eq(c_principal2);
      expect(c_weight).to.be.bignumber.eq(principal.plus(c_available));
      expect(c_weight2).to.be.bignumber.eq(c_principal);

      expect(bucketLenderHeldToken).to.be.bignumber.eq(0);
    });
  });

  // ============ Complicated case ============

  describe('Alice Bot GOOOO', () => {
    it('runs alice bot several times', async () => {
      await runAliceBot();
      await runAliceBot();
      await runAliceBot();
    });
  });

  describe('Integration Test', () => {
    it('does the complicated integration test', async () => {
      await runAliceBot();

      console.log("  depositing from good lender...");
      await doDeposit(lender1, OT.times(3));
      console.log("  done.");

      await runAliceBot();

      await issueTokenToAccountInAmountAndApproveProxy(heldToken, trader, OT.times(1000));

      console.log("  increasing position...");
      let tx = createIncreaseTx(trader, OT.times(3));
      await callIncreasePosition(margin, tx);
      console.log("  done.");

      await runAliceBot();

      await wait(60 * 60 * 24 * 4);

      console.log("  depositing from useless lender...");
      await doDeposit(uselessLender, OT.times(3));
      console.log("  done.");

      await runAliceBot();

      await wait(60 * 60 * 24 * 4);

      await issueTokenToAccountInAmountAndApproveProxy(owedToken, trader, OT.times(1000));
      await bucketLender.checkInvariants();
      console.log("  closing position...");
      await margin.closePositionDirectly(
        POSITION_ID,
        tx.principal,
        trader,
        { from: trader }
      );
      console.log("  done.");

      await bucketLender.rebalanceBuckets();
      await bucketLender.checkInvariants();
      console.log("  depositing from useless lender...");
      await expectThrow(doDeposit(uselessLender, 0));
      await doDeposit(uselessLender, OT.times(3));
      console.log("  done.");

      await wait(60 * 60 * 24 * 1);

      await runAliceBot();
      await bucketLender.checkInvariants();
      console.log("  increasing position...");
      tx = createIncreaseTx(trader, OT.times(3))
      await callIncreasePosition(margin, tx);
      tx = createIncreaseTx(trader, OT.times(3))
      await callIncreasePosition(margin, tx);
      console.log("  done.");
      await bucketLender.checkInvariants();
      // expect that the lenders can no longer withdraw their owedToken isnce it has been lent
      await expectThrow(doWithdraw(lender1, 0));
      await expectThrow(doWithdraw(lender2, 0));

      await wait(60 * 60 * 24 * 1);

      await runAliceBot();
      await bucketLender.checkInvariants();
      console.log("  closing position...");
      await margin.closePositionDirectly(
        POSITION_ID,
        tx.principal.div(2),
        trader,
        { from: trader }
      );
      console.log("  done.");
      await bucketLender.checkInvariants();
      await runAliceBot();
      await bucketLender.checkInvariants();
      // margin-call
      await expectThrow(margin.marginCall(POSITION_ID, 0, { from: lender1 }));
      await expectThrow(margin.marginCall(POSITION_ID, 1));
      await margin.marginCall(POSITION_ID, 0);
      await bucketLender.checkInvariants();
      // can't deposit while margin-called
      await expectThrow(doDeposit(uselessLender, OT));

      await wait(60 * 60 * 24 * 1);
      await bucketLender.checkInvariants();
      // cancel margin-call
      await expectThrow(margin.cancelMarginCall(POSITION_ID, { from: lender1 }));
      await margin.cancelMarginCall(POSITION_ID);
      await bucketLender.checkInvariants();
      // can deposit again
      await doDeposit(uselessLender, OT);

      await wait(60 * 60 * 24 * 1);
      await bucketLender.checkInvariants();
      // margin-call again
      await expectThrow(margin.marginCall(POSITION_ID, 0, { from: lender2 }));
      await margin.marginCall(POSITION_ID, 0);
      await bucketLender.checkInvariants();
      console.log("  closing position...");
      await margin.closePositionDirectly(
        POSITION_ID,
        BIGNUMBERS.ONES_255,
        trader,
        { from: trader }
      );
      console.log("  done.");

      await wait(60 * 60 * 24 * 1);
      await bucketLender.checkInvariants();
      //  Force-recover collateral
      console.log("  force-recovering collateral...");
      await expectThrow(margin.forceRecoverCollateral(POSITION_ID, accounts[0]));
      await margin.forceRecoverCollateral(POSITION_ID, bucketLender.address);
      console.log("  done.");
      await bucketLender.checkInvariants();
      // can't deposit after position closed
      await expectThrow(doDeposit(uselessLender, OT));
      await bucketLender.checkInvariants();
      // do bad withdrawals
      // do all remaining withdrawals
      console.log("  doing all remaining withdrawals...");
      for(let a = 0; a < 10; a++) {
        let act = accounts[a];
        for(let b = 0; b < 20; b++) {
          const hasWeight = await bucketLender.weightForBucketForAccount.call(b, act);
          if (!hasWeight.isZero()) {
            console.log("  withdrawing (bucket " + b + ") (account " + a + ")...");
            const { owedWithdrawn, heldWithdrawn, remainingWeight } = await doWithdraw(act, b);
            console.log("    owed: " + owedWithdrawn.toString());
            console.log("    held: " + heldWithdrawn.toString());
            console.log("    remw: " + remainingWeight.toString());
            console.log("  done.");
          }
        }
      }
      console.log("  done.");

      // check constants
      console.log("  checking constants...");
      const [
        c_wasForceClosed,
        c_criticalBucket,
        c_cachedRepaidAmount,
        actualRepaidAmount,

        c_available,
        c_available2,
        c_available3,
        c_principal,
        c_principal2,
        c_weight,
        c_weight2,

        isClosed,

        bucketLenderOwedToken,
        bucketLenderHeldToken,
      ] = await Promise.all([
        bucketLender.wasForceClosed.call(),
        bucketLender.criticalBucket.call(),
        bucketLender.cachedRepaidAmount.call(),
        margin.getTotalOwedTokenRepaidToLender.call(POSITION_ID),

        bucketLender.availableTotal.call(),
        bucketLender.availableForBucket.call(0),
        bucketLender.availableForBucket.call(1),
        bucketLender.principalTotal.call(),
        bucketLender.principalForBucket.call(0),
        bucketLender.weightForBucket.call(0),
        bucketLender.weightForBucketForAccount.call(0, accounts[0]),

        margin.isPositionClosed.call(POSITION_ID),

        owedToken.balanceOf.call(bucketLender.address),
        heldToken.balanceOf.call(bucketLender.address),
      ]);
      expect(c_wasForceClosed).to.be.true;
      expect(c_criticalBucket).to.be.bignumber.eq(0);
      expect(c_cachedRepaidAmount).to.be.bignumber.eq(actualRepaidAmount);
      expect(c_available).to.be.bignumber.eq(0);
      expect(c_available2).to.be.bignumber.eq(0);
      expect(c_available3).to.be.bignumber.eq(0);
      expect(c_principal).to.be.bignumber.eq(0);
      expect(c_principal2).to.be.bignumber.eq(0);
      expect(c_weight).to.be.bignumber.eq(0);
      expect(c_weight2).to.be.bignumber.eq(0);
      expect(isClosed).to.be.true;
      expect(bucketLenderOwedToken).to.be.bignumber.eq(0);
      expect(bucketLenderHeldToken).to.be.bignumber.eq(0);
      console.log("  done.");
      await bucketLender.checkInvariants();
    });
  });
});

function createIncreaseTx(trader, principal) {
  return {
    trader: trader,
    id: POSITION_ID,
    principal: principal,
    exchangeWrapper: OpenDirectlyExchangeWrapper.address,
    depositInHeldToken: true,
    buyOrder: { type: ORDER_TYPE.DIRECT },
    loanOffering: {
      owedToken: owedToken.address,
      heldToken: heldToken.address,
      payer: bucketLender.address,
      owner: bucketLender.address,
      taker: ADDRESSES.ZERO,
      positionOwner: ADDRESSES.ZERO,
      feeRecipient: ADDRESSES.ZERO,
      lenderFeeTokenAddress: ADDRESSES.ZERO,
      takerFeeTokenAddress: ADDRESSES.ZERO,
      rates: {
        maxAmount:      BIGNUMBERS.ONES_255,
        minAmount:      BIGNUMBERS.ZERO,
        minHeldToken:   BIGNUMBERS.ZERO,
        lenderFee:      BIGNUMBERS.ZERO,
        takerFee:       BIGNUMBERS.ZERO,
        interestRate:   INTEREST_RATE,
        interestPeriod: INTEREST_PERIOD
      },
      expirationTimestamp: BIGNUMBERS.ONES_255,
      callTimeLimit: CALL_TIMELIMIT.toNumber(),
      maxDuration: MAX_DURATION.toNumber(),
      salt: 0,
      signature: BYTES.EMPTY
    }
  };
}
