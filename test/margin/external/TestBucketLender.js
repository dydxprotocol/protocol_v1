const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const SharedLoan = artifacts.require("SharedLoan");
const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const BucketLender = artifacts.require("BucketLender");
const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const OpenDirectlyExchangeWrapper = artifacts.require("OpenDirectlyExchangeWrapper");

const { transact } = require('../../helpers/ContractHelper');
const { ADDRESSES, BIGNUMBERS, ORDER_TYPE } = require('../../helpers/Constants');
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

let alice;
const aliceAmount = OT;

async function doDeposit(account, amount) {
  console.log("A");
  await issueAndSetAllowance(owedToken, account, amount, bucketLender.address);
  console.log("B");
  await bucketLender.deposit(account, amount, { from: account });
  console.log("C");
}

async function doDeposit2(account, amount) {
  console.log("A");
  await issueAndSetAllowance(owedToken, account, amount, bucketLender.address);
  console.log("B");
  await bucketLender.deposit2(account, amount, { from: account });
  console.log("C");
}

async function runAliceBot() {
  console.log("  runnning alice bot...");
  console.log("    depositing...");
  await issueAndSetAllowance(owedToken, alice, aliceAmount, bucketLender.address);
  const bucket = await transact(bucketLender.deposit, alice, aliceAmount, { from: alice });
  console.log("    withdrawing (bucket " + bucket.result.toString() + ")...");
  const withdrawn = await transact(bucketLender.withdraw, [bucket.result], { from: alice });
  expect(withdrawn.result).to.be.bignumber.lte(aliceAmount);
  console.log("  done.");
}

async function setUpPosition(accounts) {
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

  alice = accounts[9];

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

        c_available,
        c_available2,
        c_principal,
        c_principal2,
        c_weight,
        c_weight2,

        principal
      ] = await Promise.all([
        bucketLender.DYDX_MARGIN.call(),
        bucketLender.OWED_TOKEN.call(),
        bucketLender.HELD_TOKEN.call(),
        bucketLender.BUCKET_TIME.call(),
        bucketLender.POSITION_ID.call(),
        bucketLender.TRUSTED_MARGIN_CALLERS.call(accounts[0]),
        bucketLender.TRUSTED_MARGIN_CALLERS.call(accounts[1]),

        bucketLender.availableTotal.call(),
        bucketLender.availableForBkt.call(0),

        bucketLender.principalTotal.call(),
        bucketLender.principalForBkt.call(0),

        bucketLender.weightForBkt.call(0),
        bucketLender.weightForBktForAct.call(0, accounts[0]),

        margin.getPositionPrincipal.call(POSITION_ID)
      ]);

      expect(c_margin).to.eq(Margin.address);
      expect(c_owedToken).to.eq(owedToken.address);
      expect(c_heldToken).to.eq(heldToken.address);
      expect(c_bucketTime).to.be.bignumber.eq(BUCKET_TIME);
      expect(c_positionId).to.eq(POSITION_ID);
      expect(c_isTrusted).to.be.true;
      expect(c_isTrusted2).to.be.false;

      expect(c_available).to.be.bignumber.eq(0);
      expect(c_available).to.be.bignumber.eq(c_available2);
      expect(c_principal).to.be.bignumber.eq(principal);
      expect(c_principal).to.be.bignumber.eq(c_principal2);
      expect(c_weight).to.be.bignumber.eq(principal);
      expect(c_weight).to.be.bignumber.eq(c_weight2);
    });
  });

  // ============ Complicated case ============

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      await runAliceBot();
      await runAliceBot();
      await runAliceBot();
    });
  });

  describe('IncreasePosition', () => {
    it('sets constants correctly', async () => {
      const lender = accounts[5];
      const uselessLender = accounts[7];
      const trader = accounts[6];
      await runAliceBot();
      await doDeposit(lender, OT.times(20));
      await runAliceBot();
      await issueTokenToAccountInAmountAndApproveProxy(heldToken, trader, OT.times(1000));

      let tx = await createIncreaseTx(trader, OT.times(2))

      console.log("  increasing position...");
      await callIncreasePosition(margin, tx);
      console.log("  done.");
      await runAliceBot();

      wait(60 * 60 * 24 * 4);

      console.log("  depositing from useless lender...");
      await doDeposit(uselessLender, OT.times(20));
      console.log("  done.");
      await runAliceBot();

      wait(60 * 60 * 24 * 4);

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
      await doDeposit2(uselessLender, OT.times(20));
      console.log("  done.");
      await runAliceBot();
    });
  });
});

async function createIncreaseTx(trader, principal) {
  const tx = {
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
      signer: trader,
      owner: bucketLender.address,
      taker: ADDRESSES.ZERO,
      positionOwner: ADDRESSES.ZERO,
      feeRecipient: ADDRESSES.ZERO,
      lenderFeeTokenAddress: ADDRESSES.ZERO,
      takerFeeTokenAddress: ADDRESSES.ZERO,
      rates: {
        maxAmount:      OT.times(1000),
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
      salt: 0
    }
  };
  tx.loanOffering.signature = await signLoanOffering(tx.loanOffering, margin);
  return tx;
}
