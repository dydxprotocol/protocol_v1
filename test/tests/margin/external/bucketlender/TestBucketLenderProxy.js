const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const TestToken = artifacts.require("TokenB");
const WETH9 = artifacts.require("WETH9");
const BucketLender = artifacts.require("BucketLender");
const BucketLenderProxy = artifacts.require("BucketLenderProxy");
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

let testToken, heldToken, weth;
let lenderProxy;
let bucketLender1, bucketLender2, bucketLender3;
let POSITION_ID_1, POSITION_ID_2, POSITION_ID_3;
const [NONCE_1, NONCE_2, NONCE_3] = [101, 102, 103];

const value = new BigNumber('1e18');

const INTEREST_PERIOD = new BigNumber(60 * 60);
const INTEREST_RATE = new BigNumber(0);
const MAX_DURATION = new BigNumber(60 * 60 * 24 * 365);
const CALL_TIMELIMIT = new BigNumber(1);
const BUCKET_TIME = new BigNumber(60 * 60 * 24);
const PRINCIPAL = new BigNumber('1e18');
const DEPOSIT = PRINCIPAL.times(2);

contract('lenderProxyForBucketLender', accounts => {
  let opener = accounts[9];
  let sender = accounts[8];

  // ============ Before ============

  beforeEach('Set up contracts', async () => {
    POSITION_ID_1 = web3Instance.utils.soliditySha3(opener, NONCE_1);
    POSITION_ID_2 = web3Instance.utils.soliditySha3(opener, NONCE_2);
    POSITION_ID_3 = web3Instance.utils.soliditySha3(opener, NONCE_3);

    [
      testToken,
      heldToken,
      weth,
    ] = await Promise.all([
      TestToken.new(),
      HeldToken.new(),
      WETH9.new(),
    ]);

    lenderProxy = await BucketLenderProxy.new(weth.address);

    bucketLender1 = await BucketLender.new(
      Margin.address,
      POSITION_ID_1,
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
      [lenderProxy.address], // trusted withdrawers
    );

    bucketLender2 = await BucketLender.new(
      Margin.address,
      POSITION_ID_2,
      testToken.address,
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
      [lenderProxy.address], // trusted withdrawers
    );

    bucketLender3 = await BucketLender.new(
      Margin.address,
      POSITION_ID_3,
      heldToken.address,
      testToken.address,
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
      [lenderProxy.address], // trusted withdrawers
    );
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const c_weth = await lenderProxy.WETH.call();
      expect(c_weth).to.eq(weth.address);
    });
  });

  describe('#depositEth', () => {
    it('fails for zero amount', async () => {
      await expectThrow(lenderProxy.depositEth(
        bucketLender1.address,
        { from: sender, value: BIGNUMBERS.ZERO }
      ));
    });

    it('fails for bad bucketLender address', async () => {
      await expectThrow(lenderProxy.depositEth(
        Margin.address,
        { from: sender, value: value }
      ));
      await expectThrow(lenderProxy.depositEth(
        sender,
        { from: sender, value: value }
      ));
    });

    it('fails for bucketLender that doesnt take WETH', async () => {
      await expectThrow(lenderProxy.depositEth(
        bucketLender3.address,
        { from: sender, value: value }
      ));
    });

    it('succeeds', async () => {
      let result;

      result = await transact(
        lenderProxy.depositEth,
        bucketLender1.address,
        { from: sender, value: value }
      );
      expect(result.result).to.be.bignumber.eq(0); // expect bucket 0

      result = await transact(
        lenderProxy.depositEth,
        bucketLender1.address,
        { from: sender, value: value }
      );
      expect(result.result).to.be.bignumber.eq(0); // expect bucket 0

      const [
        weight1,
        weight2
      ] = await Promise.all([
        bucketLender1.weightForBucket.call(0),
        bucketLender1.weightForBucketForAccount.call(0, sender),
      ]);
      expect(weight1).to.be.bignumber.eq(value.times(2));
      expect(weight2).to.be.bignumber.eq(value.times(2));
    });
  });

  describe('#deposit', () => {
    it('fails for invalid bucketLender address', async () => {
      await issueAndSetAllowance(testToken, sender, value, lenderProxy.address);
      await expectThrow(lenderProxy.deposit(
        Margin.address,
        value,
        { from: sender }
      ));
    });

    it('fails for zero amount', async () => {
      await expectThrow(lenderProxy.deposit(
        bucketLender3.address,
        new BigNumber(0),
        { from: sender }
      ));
    });

    it('succeeds', async () => {
      let result;
      await issueAndSetAllowance(testToken, sender, value.times(2), lenderProxy.address);

      result = await transact(
        lenderProxy.deposit,
        bucketLender3.address,
        value,
        { from: sender }
      );
      expect(result.result).to.be.bignumber.eq(0); // expect bucket 0

      result = await transact(
        lenderProxy.deposit,
        bucketLender3.address,
        value,
        { from: sender }
      );
      expect(result.result).to.be.bignumber.eq(0); // expect bucket 0

      const [
        weight1,
        weight2
      ] = await Promise.all([
        bucketLender3.weightForBucket.call(0),
        bucketLender3.weightForBucketForAccount.call(0, sender),
      ]);
      expect(weight1).to.be.bignumber.eq(value.times(2));
      expect(weight2).to.be.bignumber.eq(value.times(2));
    });
  });

  describe('#rollover', () => {
    beforeEach('deposit in bucket lender 1', async () => {
      const receipt = await transact(
        lenderProxy.depositEth,
        bucketLender1.address,
        { from: sender, value: value }
      );
      expect(receipt.result).to.be.bignumber.eq(0);
    });

    it('fails for invalid withdrawFrom', async () => {
      await expectThrow(
        lenderProxy.rollover(
          Margin.address,
          bucketLender2.address,
          [0],
          [BIGNUMBERS.MAX_UINT256],
          { from: sender }
        )
      );
    });

    it('fails for invalid depositInto', async () => {
      await expectThrow(
        lenderProxy.rollover(
          bucketLender1.address,
          Margin.address,
          [0],
          [BIGNUMBERS.MAX_UINT256],
          { from: sender }
        )
      );
    });

    it('fails for token mismatch', async () => {
      await expectThrow(
        lenderProxy.rollover(
          bucketLender1.address,
          bucketLender3.address,
          [0],
          [BIGNUMBERS.MAX_UINT256],
          { from: sender }
        )
      );
    });

    it('fails for zero withdraw amount', async () => {
      await expectThrow(
        lenderProxy.rollover(
          bucketLender1.address,
          bucketLender2.address,
          [1],
          [BIGNUMBERS.MAX_UINT256],
          { from: sender }
        )
      );
    });

    it('succeeds', async () => {
      const expectedOwedTokenAmount = await bucketLender1.weightForBucketForAccount.call(0, sender);
      const receipt = await transact(
        lenderProxy.rollover,
        bucketLender1.address,
        bucketLender2.address,
        [0],
        [BIGNUMBERS.MAX_UINT256],
        { from: sender }
      );
      const [bucket, owedTokenAmount, heldTokenAmount] = receipt.result;
      expect(bucket).to.be.bignumber.eq(0);
      expect(owedTokenAmount).to.be.bignumber.eq(expectedOwedTokenAmount);
      expect(heldTokenAmount).to.be.bignumber.eq(0);
    });
  });

  describe('#withdraw', () => {
    it('succeeds when withdrawing just eth', async () => {
      await lenderProxy.depositEth(
        bucketLender1.address,
        { from: sender, value: value }
      );

      const balance0 = await web3.eth.getBalance(sender);

      const receipt = await transact(
        lenderProxy.withdraw,
        bucketLender1.address,
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
          bucketLender1.address
        ],
        [
          PRINCIPAL,
          DEPOSIT,
          NONCE_1
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
      await lenderProxy.depositEth(
        bucketLender1.address,
        { from: sender, value: value }
      );

      // increase the position
      await wait(10);
      const incrTx = createIncreaseTx(opener, value.div(2));
      await callIncreasePosition(margin, incrTx);

      await margin.marginCall(POSITION_ID_1, 0, { from: opener });
      await wait(10);
      await margin.forceRecoverCollateral(POSITION_ID_1, bucketLender1.address);

      // withdraw both owedToken and heldToken
      {
        const receipt = await transact(
          lenderProxy.withdraw,
          bucketLender1.address,
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
          lenderProxy.withdraw,
          bucketLender1.address,
          [0],
          [BIGNUMBERS.MAX_UINT256],
          { from: opener }
        );
        const [ethAmount, heldTokenAmount] = receipt.result;
        expect(heldTokenAmount).to.be.bignumber.eq(DEPOSIT);
        expect(ethAmount).to.be.bignumber.eq(0);
      }
    });

    it('fails for bad bucketLender address', async () => {
      await expectThrow(lenderProxy.withdraw(
        Margin.address,
        [0],
        [BIGNUMBERS.MAX_UINT256],
        { from: sender }
      ));
      await expectThrow(lenderProxy.withdraw(
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
    id: POSITION_ID_1,
    principal: principal,
    exchangeWrapper: OpenDirectlyExchangeWrapper.address,
    depositInHeldToken: true,
    buyOrder: { type: ORDER_TYPE.DIRECT },
    loanOffering: {
      owedToken: weth.address,
      heldToken: heldToken.address,
      payer: bucketLender1.address,
      owner: bucketLender1.address,
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
