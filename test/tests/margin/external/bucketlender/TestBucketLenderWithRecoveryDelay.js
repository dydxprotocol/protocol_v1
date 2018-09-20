const chai = require('chai');
chai.use(require('chai-bignumber')());
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const BucketLenderWithRecoveryDelay = artifacts.require("BucketLenderWithRecoveryDelay");
const ERC20ShortFactory = artifacts.require("ERC20ShortFactory");

const { transact } = require('../../../../helpers/ContractHelper');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const { issueAndSetAllowance } = require('../../../../helpers/TokenHelper');
const { issueTokenToAccountInAmountAndApproveProxy } = require('../../../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

let OT = new BigNumber('1234567898765543211');

const web3Instance = new Web3(web3.currentProvider);

const INTEREST_PERIOD = new BigNumber(60 * 60);
const INTEREST_RATE = new BigNumber(10 * 1000000);
const MAX_DURATION = new BigNumber(60 * 60 * 24 * 365);
const CALL_TIMELIMIT = new BigNumber(60 * 60 * 24);
const BUCKET_TIME = new BigNumber(60 * 60 * 24);
const RECOVERY_DELAY = new BigNumber(60 * 60 * 6);
let POSITION_ID, NONCE;

let margin, heldToken, owedToken;
let bucketLender;
let TRUSTED_PARTY, TRUSTED_WITHDRAWER, lender1, lender2, trader;

// grants tokens to a lender and has them deposit them into the bucket lender
async function doDeposit(account, amount) {
  await issueAndSetAllowance(owedToken, account, amount, bucketLender.address);
  const tx = await transact(bucketLender.deposit, account, amount, { from: account });
  return tx.result;
}

async function setUpPosition(accounts, openThePosition = true) {
  [
    TRUSTED_PARTY,
    TRUSTED_WITHDRAWER,
    lender1,
    lender2,
    trader,
  ] = [
    accounts[0],
    accounts[6],
    accounts[7],
    accounts[8],
    accounts[9],
  ];

  NONCE = Math.floor(Math.random() * 12983748912748);
  POSITION_ID = web3Instance.utils.soliditySha3(TRUSTED_PARTY, NONCE);

  const principal = OT.times(2);
  const deposit = OT.times(6);

  bucketLender = await BucketLenderWithRecoveryDelay.new(
    Margin.address,
    POSITION_ID,
    heldToken.address,
    owedToken.address,
    [
      BUCKET_TIME,
      INTEREST_RATE,
      INTEREST_PERIOD,
      MAX_DURATION,
      CALL_TIMELIMIT,
      3,
      1
    ],
    [TRUSTED_PARTY], // trusted margin-callers
    [TRUSTED_WITHDRAWER],
    RECOVERY_DELAY
  );

  await Promise.all([
    issueTokenToAccountInAmountAndApproveProxy(owedToken, TRUSTED_PARTY, OT.times(1000)),
    issueTokenToAccountInAmountAndApproveProxy(heldToken, TRUSTED_PARTY, deposit),
    doDeposit(lender1, OT.times(2)),
    doDeposit(lender2, OT.times(3)),
    issueTokenToAccountInAmountAndApproveProxy(heldToken, trader, OT.times(1000)),
    issueTokenToAccountInAmountAndApproveProxy(owedToken, trader, OT.times(1000)),
  ]);

  if (!openThePosition) {
    return;
  }

  await margin.openWithoutCounterparty(
    [
      ERC20ShortFactory.address,
      owedToken.address,
      heldToken.address,
      bucketLender.address
    ],
    [
      principal,
      deposit,
      NONCE
    ],
    [
      CALL_TIMELIMIT,
      MAX_DURATION,
      INTEREST_RATE,
      INTEREST_PERIOD
    ],
    { from: TRUSTED_PARTY }
  );
}

contract('BucketLenderWithRecoveryDelay', accounts => {

  // ============ Before/After ============

  beforeEach('set up contracts', async () => {
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

  describe('#forceRecoverCollateralOnBehalfOf', () => {
    let recoveryDelay;

    beforeEach('margin-call the position', async () => {
      recoveryDelay = await bucketLender.RECOVERY_DELAY.call();
    });

    it('succeeds only after maxduration plus recovery delay', async () => {
      await wait(MAX_DURATION.toNumber());

      await expectThrow(
        margin.forceRecoverCollateral(
          POSITION_ID,
          bucketLender.address,
          { from: TRUSTED_PARTY }
        )
      );

      await wait(recoveryDelay.toNumber());

      await margin.forceRecoverCollateral(
        POSITION_ID,
        bucketLender.address,
        { from: TRUSTED_PARTY }
      );
    });

    it('succeeds only after maxduration plus recovery delay (even if margin-called)', async () => {
      await wait(MAX_DURATION.toNumber());

      await expectThrow(
        margin.forceRecoverCollateral(
          POSITION_ID,
          bucketLender.address,
          { from: TRUSTED_PARTY }
        )
      );

      await wait(recoveryDelay.toNumber());
      await margin.marginCall(POSITION_ID, 0, { from: TRUSTED_PARTY });

      await margin.forceRecoverCollateral(
        POSITION_ID,
        bucketLender.address,
        { from: TRUSTED_PARTY }
      );
    });

    it('succeeds only after callTimeLimit plus recovery delay', async () => {
      await margin.marginCall(POSITION_ID, 0, { from: TRUSTED_PARTY });
      await wait(CALL_TIMELIMIT.toNumber());

      await expectThrow(
        margin.forceRecoverCollateral(
          POSITION_ID,
          bucketLender.address,
          { from: TRUSTED_PARTY }
        )
      );

      await wait(recoveryDelay.toNumber());

      await margin.forceRecoverCollateral(
        POSITION_ID,
        bucketLender.address,
        { from: TRUSTED_PARTY }
      );
    });
  });
});
