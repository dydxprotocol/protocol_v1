const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const BucketLender = artifacts.require("BucketLender");
const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const OpenDirectlyExchangeWrapper = artifacts.require("OpenDirectlyExchangeWrapper");

const { transact } = require('../../helpers/ContractHelper');
const { ADDRESSES, BIGNUMBERS, BYTES, ORDER_TYPE } = require('../../helpers/Constants');
const { expectThrow } = require('../../helpers/ExpectHelper');
const { issueAndSetAllowance } = require('../../helpers/TokenHelper');
const { signLoanOffering } = require('../../helpers/LoanHelper');
const {
  issueTokenToAccountInAmountAndApproveProxy,
  doOpenPosition,
  getPosition,
  callIncreasePosition
} = require('../../helpers/MarginHelper');
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
  console.log("    depositing...");
  await issueAndSetAllowance(owedToken, alice, aliceAmount, bucketLender.address);
  const bucket = await transact(bucketLender.deposit, alice, aliceAmount, { from: alice });
  console.log("    withdrawing (bucket " + bucket.result.toString() + ")...");
  const { owedWithdrawn, heldWithdrawn, remainingWeight } = await doWithdraw(alice, bucket.result);
  expect(owedWithdrawn).to.be.bignumber.lte(aliceAmount);
  expect(owedWithdrawn.plus(1)).to.bignumber.gte(aliceAmount);
  expect(heldWithdrawn).to.be.bignumber.eq(0);
  expect(remainingWeight).to.be.bignumber.eq(0);
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

  bucketLender = await BucketLender.new(
    Margin.address,
    POSITION_ID,
    heldToken.address,
    owedToken.address,
    BUCKET_TIME,
    [accounts[0]] // trusted margin-callers
  );

  const principal = new BigNumber('22e18');
  const deposit = new BigNumber('60e18');

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

      console.log("  closing position...");
      await margin.closePositionDirectly(
        POSITION_ID,
        tx.principal,
        trader,
        { from: trader }
      );
      console.log("  done.");
      await bucketLender.rebalanceBuckets();
      console.log("  depositing from useless lender...");
      await doDeposit(uselessLender, OT.times(3));
      console.log("  done.");

      await wait(60 * 60 * 24 * 1);

      await runAliceBot();

      console.log("  increasing position...");
      tx = createIncreaseTx(trader, OT.times(3))
      await callIncreasePosition(margin, tx);
      tx = createIncreaseTx(trader, OT.times(3))
      await callIncreasePosition(margin, tx);
      console.log("  done.");

      // expect that the lenders can no longer withdraw their owedToken isnce it has been lent
      await expectThrow(doWithdraw(lender1, 0));
      await expectThrow(doWithdraw(lender2, 0));

      await wait(60 * 60 * 24 * 1);

      await runAliceBot();

      console.log("  closing position...");
      await margin.closePositionDirectly(
        POSITION_ID,
        tx.principal.div(2),
        trader,
        { from: trader }
      );
      console.log("  done.");

      await runAliceBot();

      await margin.marginCall(POSITION_ID, 0);

      await wait(60 * 60 * 24 * 1);

      await margin.cancelMarginCall(POSITION_ID);

      await wait(60 * 60 * 24 * 1);

      await margin.marginCall(POSITION_ID, 0);

      console.log("  closing position...");
      await margin.closePositionDirectly(
        POSITION_ID,
        BIGNUMBERS.ONES_255,
        trader,
        { from: trader }
      );
      console.log("  done.");

      await wait(60 * 60 * 24 * 1);

      await margin.forceRecoverCollateral(POSITION_ID, bucketLender.address);

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
      expirationTimestamp: 1000000000000,
      callTimeLimit: CALL_TIMELIMIT.toNumber(),
      maxDuration: MAX_DURATION.toNumber(),
      salt: 0,
      signature: BYTES.EMPTY
    }
  };
}
