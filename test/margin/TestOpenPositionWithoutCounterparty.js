/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
const Web3 = require('web3');
chai.use(require('chai-bignumber')());
const { wait } = require('@digix/tempo')(web3);
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const ProxyContract = artifacts.require("Proxy");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const { ADDRESSES, DEFAULT_SALT } = require('../helpers/Constants');
const ExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const Vault = artifacts.require("Vault");
const { getOwedAmount } = require('../helpers/ClosePositionHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { signOrder } = require('../helpers/ZeroExHelper');
const { issueAndSetAllowance } = require('../helpers/TokenHelper');
const { BIGNUMBERS } = require('../helpers/Constants');

const {
  getPosition,
  callIncreasePosition,
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition,
  issueTokenToAccountInAmountAndApproveProxy,
} = require('../helpers/MarginHelper');

const web3Instance = new Web3(web3.currentProvider);

describe('#increasePosition', () => {
  contract('Margin', accounts => {
    it.only('succeeds on valid inputs', async () => {
      const [
        openTx,
        dydxMargin
      ] = await Promise.all([
        setup(accounts),
        Margin.deployed()
      ]);

      const tx = await callOpenPositionWithoutCounterparty(dydxMargin, openTx);

      console.log(
        '\tMargin.openPositionWithoutCounterparty gas used: '
        + tx.receipt.gasUsed
      );
    });
  });
});

async function setup(accounts) {
  const trader = accounts[1];
  const loanOwner = accounts[2];
  const positionOwner = accounts[3];

  const deposit   = new BigNumber('1098765932109876543');
  const principal = new BigNumber('2387492837498237491');
  const nonce = new BigNumber('19238');

  const callTimeLimit = BIGNUMBERS.ONE_DAY_IN_SECONDS;
  const maxDuration = BIGNUMBERS.ONE_YEAR_IN_SECONDS;

  const interestRate = new BigNumber('600000');
  const interestPeriod = BIGNUMBERS.ONE_YEAR_IN_SECONDS;

  const heldToken = await HeldToken.deployed();

  await issueAndSetAllowance(
    heldToken,
    trader,
    deposit,
    ProxyContract.address
  );

  return {
    trader,
    loanOwner,
    positionOwner,
    deposit,
    principal,
    nonce,
    callTimeLimit,
    maxDuration,
    interestRate,
    interestPeriod,
  };
}

async function callOpenPositionWithoutCounterparty(dydxMargin, openTx) {
  const positionId = web3Instance.utils.soliditySha3(
    openTx.trader,
    openTx.nonce
  );

  let contains = await dydxMargin.containsPosition.call(positionId);
  expect(contains).to.be.false;

  const response = await dydxMargin.openPositionWithoutCounterparty(
    [
      openTx.positionOwner,
      openTx.owedToken,
      openTx.heldToken,
      openTx.loanOwner
    ],
    [
      openTx.principal,
      openTx.deposit,
      openTx.nonce
    ],
    [
      openTx.callTimeLimit,
      openTx.maxDuration,
      openTx.interestRate,
      openTx.interestPeriod
    ],
    { from: openTx.trader }
  );

  contains = await dydxMargin.containsPosition.call(positionId);
  expect(contains).to.be.true;

  response.id = positionId;

  await expectLog(dydxMargin, positionId, openTx, response);

  return response;
}

async function expectLog(dydxMargin, positionId, openTx, response) {
  expectLog(response.logs[0], 'PositionOpened', {
    positionId: positionId,
    trader: openTx.trader,
    lender: openTx.trader,
    loanHash: ADDRESSES.ZERO,
    owedToken: openTx.owedToken,
    heldToken: openTx.heldToken,
    loanFeeRecipient: ADDRESSES.ZERO,
    principal: openTx.principal,
    heldTokenFromSell: BIGNUMBERS.ZERO,
    depositAmount: openTx.deposit,
    interestRate: openTx.interestRate,
    callTimeLimit: openTx.callTimeLimit,
    maxDuration: openTx.maxDuration,
    depositInHeldToken: true
  });

  const newOwner = await dydxMargin.getPositionOwner.call(positionId);
  const newLender = await dydxMargin.getPositionLender.call(positionId);
  let logIndex = 0;
  if (openTx.loanOwner !== openTx.trader) {
    expectLog(response.logs[++logIndex], 'LoanTransferred', {
      positionId: positionId,
      from: openTx.trader,
      to: openTx.loanOwner
    });
    if (newLender !== openTx.loanOwner) {
      expectLog(response.logs[++logIndex], 'LoanTransferred', {
        positionId: positionId,
        from: openTx.loanOwner,
        to: newLender
      });
    }
  }
  if (openTx.positionOwner !== openTx.trader) {
    expectLog(response.logs[++logIndex], 'PositionTransferred', {
      positionId: positionId,
      from: openTx.trader,
      to: openTx.positionOwner
    });
    if (newOwner !== openTx.positionOwner) {
      expectLog(response.logs[++logIndex], 'PositionTransferred', {
        positionId: positionId,
        from: openTx.positionOwner,
        to: newOwner
      });
    }
  }
}
