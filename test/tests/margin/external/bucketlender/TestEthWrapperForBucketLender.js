const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const WETH9 = artifacts.require("WETH9");
const BucketLender = artifacts.require("BucketLender");
const EthWrapperForBucketLender = artifacts.require("EthWrapperForBucketLender");
const OpenDirectlyExchangeWrapper = artifacts.require("OpenDirectlyExchangeWrapper");

const { transact } = require('../../../../helpers/ContractHelper');
const { ADDRESSES, BIGNUMBERS, BYTES, ORDER_TYPE } = require('../../../../helpers/Constants');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const { issueAndSetAllowance } = require('../../../../helpers/TokenHelper');
const {
  callIncreasePosition,
  issueTokenToAccountInAmountAndApproveProxy
} = require('../../../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

let heldToken, weth, bucketLender, ethWrapper;
const value = new BigNumber('1e18');
const INTEREST_PERIOD = new BigNumber(60 * 60);
const INTEREST_RATE = new BigNumber(0);
const MAX_DURATION = new BigNumber(60 * 60 * 24 * 365);
const CALL_TIMELIMIT = new BigNumber(1);
const BUCKET_TIME = new BigNumber(60 * 60 * 24);
const PRINCIPAL = new BigNumber('1e18');
const DEPOSIT = PRINCIPAL.times(2);
let NONCE = 101;
let POSITION_ID;

contract('EthWrapperForBucketLender', accounts => {
  let opener = accounts[9];

  // ============ Before ============

  beforeEach('Set up contracts', async () => {
    POSITION_ID = web3Instance.utils.soliditySha3(opener, NONCE);

    [
      heldToken,
      weth,
    ] = await Promise.all([
      HeldToken.new(),
      WETH9.new(),
    ]);

    ethWrapper = await EthWrapperForBucketLender.new(weth.address);

    bucketLender = await BucketLender.new(
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
      [opener], // trusted margin-callers
      [ethWrapper.address], // trusted withdrawers
    );
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const c_weth = await ethWrapper.WETH.call();
      expect(c_weth).to.eq(weth.address);
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

  describe('#withdrawEth', () => {
    const sender = accounts[1];

    it('succeeds when withdrawing just eth', async () => {
      await ethWrapper.depositEth(
        bucketLender.address,
        sender,
        { from: sender, value: value }
      );

      const balance0 = await web3.eth.getBalance(sender);

      const receipt = await transact(
        ethWrapper.withdrawEth,
        bucketLender.address,
        [0],
        [BIGNUMBERS.MAX_UINT256],
        { from: sender }
      );
      const tx = await web3.eth.getTransaction(receipt.tx);
      const gasUsed = receipt.receipt.gasUsed;
      const gasPrice = tx.gasPrice;
      const ethUsedToSendTx = gasPrice.times(gasUsed);
      const [ethAmount, heldTokenAmount] = receipt.result;

      const balance1 = await web3.eth.getBalance(sender);

      expect(balance1.minus(balance0)).to.be.bignumber.eq(ethAmount.minus(ethUsedToSendTx));
      expect(heldTokenAmount).to.be.bignumber.eq(0);
      expect(ethAmount).to.be.bignumber.eq(value);
    });

    it('succeeds when withdrawing heldToken', async () => {
      const margin = await Margin.deployed();
      await issueTokenToAccountInAmountAndApproveProxy(heldToken, opener, DEPOSIT.times(1000));

      await margin.openWithoutCounterparty(
        [
          opener,
          weth.address,
          heldToken.address,
          bucketLender.address
        ],
        [
          PRINCIPAL,
          DEPOSIT,
          NONCE++
        ],
        [
          CALL_TIMELIMIT,
          MAX_DURATION,
          INTEREST_RATE,
          INTEREST_PERIOD
        ],
        { from: opener }
      );

      // deposit some more
      await wait(10);
      await ethWrapper.depositEth(
        bucketLender.address,
        sender,
        { from: sender, value: value }
      );

      // increase the position
      await wait(10);
      const incrTx = createIncreaseTx(opener, value.div(2));
      await callIncreasePosition(margin, incrTx);

      await margin.marginCall(POSITION_ID, 0, { from: opener });
      await wait(10);
      await margin.forceRecoverCollateral(POSITION_ID, bucketLender.address);

      // withdraw both owedToken and heldToken
      {
        const receipt = await transact(
          ethWrapper.withdrawEth,
          bucketLender.address,
          [1],
          [BIGNUMBERS.MAX_UINT256],
          { from: sender }
        );
        const [ethAmount, heldTokenAmount] = receipt.result;
        expect(heldTokenAmount).to.be.bignumber.gt(0);
        expect(ethAmount).to.be.bignumber.gt(0);
      }

      // withdraw just heldToken
      {
        const receipt = await transact(
          ethWrapper.withdrawEth,
          bucketLender.address,
          [0],
          [BIGNUMBERS.MAX_UINT256],
          { from: opener }
        );
        const [ethAmount, heldTokenAmount] = receipt.result;
        expect(heldTokenAmount).to.be.bignumber.eq(DEPOSIT);
        expect(ethAmount).to.be.bignumber.eq(0);
      }
    });

    it('fails when withdrawing for non-weth owedToken', async () => {
      bucketLender = await BucketLender.new(
        Margin.address,
        POSITION_ID,
        weth.address,
        heldToken.address,
        [
          BUCKET_TIME,
          INTEREST_RATE,
          INTEREST_PERIOD,
          MAX_DURATION,
          CALL_TIMELIMIT,
          DEPOSIT, // MIN_HELD_TOKEN_NUMERATOR,
          PRINCIPAL, // MIN_HELD_TOKEN_DENOMINATOR,
        ],
        [], // trusted margin-callers
        [ethWrapper.address], // trusted withdrawers
      );
      await issueAndSetAllowance(
        heldToken,
        sender,
        value,
        bucketLender.address
      );
      await bucketLender.deposit(sender, value, { from: sender });
      await expectThrow(
        ethWrapper.withdrawEth(
          bucketLender.address,
          [0],
          [BIGNUMBERS.MAX_UINT256],
          { from: sender }
        )
      );
    });

    it('fails for bad bucketLender address', async () => {
      const sender = accounts[1];
      await expectThrow(ethWrapper.withdrawEth(
        Margin.address,
        [0],
        [BIGNUMBERS.MAX_UINT256],
        { from: sender }
      ));
      await expectThrow(ethWrapper.withdrawEth(
        sender,
        [0],
        [BIGNUMBERS.MAX_UINT256],
        { from: sender }
      ));
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
      owedToken: weth.address,
      heldToken: heldToken.address,
      payer: bucketLender.address,
      owner: bucketLender.address,
      taker: ADDRESSES.ZERO,
      positionOwner: ADDRESSES.ZERO,
      feeRecipient: ADDRESSES.ZERO,
      lenderFeeTokenAddress: ADDRESSES.ZERO,
      takerFeeTokenAddress: ADDRESSES.ZERO,
      rates: {
        maxAmount:      BIGNUMBERS.MAX_UINT256,
        minAmount:      BIGNUMBERS.ZERO,
        minHeldToken:   BIGNUMBERS.ZERO,
        lenderFee:      BIGNUMBERS.ZERO,
        takerFee:       BIGNUMBERS.ZERO,
        interestRate:   INTEREST_RATE,
        interestPeriod: INTEREST_PERIOD
      },
      expirationTimestamp: BIGNUMBERS.MAX_UINT256,
      callTimeLimit: BIGNUMBERS.MAX_UINT32,
      maxDuration: BIGNUMBERS.MAX_UINT32,
      salt: 0,
      signature: BYTES.EMPTY
    }
  };
}
