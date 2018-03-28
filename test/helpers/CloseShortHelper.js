/*global artifacts*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const Vault = artifacts.require("Vault");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const { getPartialAmount } = require('../helpers/MathHelper');
const { BIGNUMBERS } = require('./Constants');
const { getBlockTimestamp } = require('./NodeHelper');
const { getMaxInterestFee } = require('./ShortSellHelper');

module.exports = {
  checkSuccess,
  checkSmartContractBalances,
  checkLenderBalances,
  getInterestFee,
  getBalances,
  checkSuccessCloseDirectly,
  getShortLifetime,
};

async function checkSuccess(shortSell, shortTx, closeTx, sellOrder, closeAmount) {
  const interestFee = await getInterestFee(shortTx, closeTx, closeAmount);
  const underlyingTokenOwedToLender = closeAmount.plus(interestFee);
  const baseTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    closeAmount
  );
  const baseTokenBuybackCost = getPartialAmount(
    sellOrder.takerTokenAmount,
    sellOrder.makerTokenAmount,
    underlyingTokenOwedToLender
  );

  const balances = await getBalances(shortSell, shortTx, sellOrder);
  const {
    sellerBaseToken,
    externalSellerBaseToken,
    externalSellerUnderlyingToken,
    sellerFeeToken,
    externalSellerFeeToken,
    feeRecipientFeeToken
  } = balances;

  checkSmartContractBalances(balances, shortTx, closeAmount);
  checkLenderBalances(balances, interestFee, shortTx, closeAmount);

  expect(sellerBaseToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      shortTx.shortAmount,
      shortTx.depositAmount
    ).plus(baseTokenFromSell)
      .minus(baseTokenBuybackCost)
  );
  expect(externalSellerBaseToken).to.be.bignumber.equal(baseTokenBuybackCost);
  expect(externalSellerUnderlyingToken).to.be.bignumber.equal(
    sellOrder.makerTokenAmount.minus(underlyingTokenOwedToLender)
  );
  expect(feeRecipientFeeToken).to.be.bignumber.equal(
    getPartialAmount(
      underlyingTokenOwedToLender,
      sellOrder.makerTokenAmount,
      sellOrder.takerFee
    ).plus(
      getPartialAmount(
        underlyingTokenOwedToLender,
        sellOrder.makerTokenAmount,
        sellOrder.makerFee
      )
    )
  );
  expect(sellerFeeToken).to.be.bignumber.equal(
    shortTx.buyOrder.takerFee
      .plus(shortTx.loanOffering.rates.takerFee)
      .plus(sellOrder.takerFee)
      .minus(
        getPartialAmount(
          shortTx.shortAmount,
          shortTx.loanOffering.rates.maxAmount,
          shortTx.loanOffering.rates.takerFee
        )
      )
      .minus(
        getPartialAmount(
          shortTx.shortAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.buyOrder.takerFee
        )
      )
      .minus(
        getPartialAmount(
          underlyingTokenOwedToLender,
          sellOrder.makerTokenAmount,
          sellOrder.takerFee
        )
      )
  );
  expect(externalSellerFeeToken).to.be.bignumber.equal(
    sellOrder.makerFee
      .minus(
        getPartialAmount(
          underlyingTokenOwedToLender,
          sellOrder.makerTokenAmount,
          sellOrder.makerFee
        )
      )
  );
}

function checkSmartContractBalances(balances, shortTx, closeAmount) {
  const startingShortBaseTokenAmount = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    shortTx.shortAmount
  ).plus(shortTx.depositAmount);
  const expectedShortBalance = getPartialAmount(
    shortTx.shortAmount.minus(closeAmount),
    shortTx.shortAmount,
    startingShortBaseTokenAmount
  );

  const {
    vaultFeeToken,
    vaultBaseToken,
    vaultUnderlyingToken,
    shortBalance
  } = balances;

  expect(vaultFeeToken).to.be.bignumber.equal(0);
  expect(vaultBaseToken).to.be.bignumber.equal(expectedShortBalance);
  expect(vaultUnderlyingToken).to.be.bignumber.equal(0);
  expect(shortBalance).to.be.bignumber.equal(expectedShortBalance);
}

function checkLenderBalances(balances, interestFee, shortTx, closeAmount) {
  const {
    lenderBaseToken,
    lenderUnderlyingToken,
  } = balances;
  expect(lenderBaseToken).to.be.bignumber.equal(0);

  const one = new BigNumber(1);
  const interestFeeErrorBounds = new BigNumber('.00001');

  const minExpected = shortTx.loanOffering.rates.maxAmount
    .minus(shortTx.shortAmount)
    .plus(closeAmount)
    .plus((one.minus(interestFeeErrorBounds)).times(interestFee));
  const maxExpected = shortTx.loanOffering.rates.maxAmount
    .minus(shortTx.shortAmount)
    .plus(closeAmount)
    .plus((one.plus(interestFeeErrorBounds)).times(interestFee));

  expect(lenderUnderlyingToken).to.be.bignumber.at.least(minExpected);
  expect(lenderUnderlyingToken).to.be.bignumber.at.most(maxExpected);
}

async function getInterestFee(shortTx, closeTx, closeAmount) {
  let shortLifetime = await getShortLifetime(shortTx, closeTx);

  await TestInterestImpl.link('InterestImpl', InterestImpl.address);
  const interestCalc = await TestInterestImpl.new();

  const interest = await interestCalc.getCompoundedInterest.call(
    shortTx.shortAmount,
    shortTx.loanOffering.rates.annualInterestRate,
    new BigNumber(shortLifetime),
    BIGNUMBERS.ONE_DAY_IN_SECONDS
  );
  return getPartialAmount(
    closeAmount,
    shortTx.shortAmount,
    interest,
    true // round up
  );
}

async function getBalances(shortSell, shortTx, sellOrder) {
  const [
    underlyingToken,
    baseToken,
    feeToken
  ] = await Promise.all([
    UnderlyingToken.deployed(),
    BaseToken.deployed(),
    FeeToken.deployed(),
  ]);

  let externalSellerBaseToken,
    externalSellerUnderlyingToken,
    externalSellerFeeToken,
    feeRecipientFeeToken;

  if (sellOrder) {
    [
      externalSellerBaseToken,
      externalSellerUnderlyingToken,
      externalSellerFeeToken,
      feeRecipientFeeToken,
    ] = await Promise.all([
      baseToken.balanceOf.call(sellOrder.maker),
      underlyingToken.balanceOf.call(sellOrder.maker),
      feeToken.balanceOf.call(sellOrder.maker),
      feeToken.balanceOf.call(sellOrder.feeRecipient),
    ]);
  }

  const [
    sellerBaseToken,
    sellerUnderlyingToken,

    lenderBaseToken,
    lenderUnderlyingToken,

    sellerFeeToken,

    vaultFeeToken,
    vaultBaseToken,
    vaultUnderlyingToken,

    shortBalance
  ] = await Promise.all([
    baseToken.balanceOf.call(shortTx.seller),
    underlyingToken.balanceOf.call(shortTx.seller),

    baseToken.balanceOf.call(shortTx.loanOffering.lender),
    underlyingToken.balanceOf.call(shortTx.loanOffering.lender),

    feeToken.balanceOf.call(shortTx.seller),

    feeToken.balanceOf.call(Vault.address),
    baseToken.balanceOf.call(Vault.address),
    underlyingToken.balanceOf.call(Vault.address),

    shortSell.getShortBalance.call(shortTx.id)
  ]);

  return {
    sellerBaseToken,
    sellerUnderlyingToken,

    lenderBaseToken,
    lenderUnderlyingToken,

    externalSellerBaseToken,
    externalSellerUnderlyingToken,
    externalSellerFeeToken,
    sellerFeeToken,

    feeRecipientFeeToken,

    vaultFeeToken,
    vaultBaseToken,
    vaultUnderlyingToken,

    shortBalance
  };
}

async function checkSuccessCloseDirectly(shortSell, shortTx, closeTx, closeAmount) {
  const interestFee = await getInterestFee(shortTx, closeTx, closeAmount);
  const underlyingTokenOwedToLender = closeAmount.plus(interestFee);
  const balances = await getBalances(shortSell, shortTx);
  const baseTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    closeAmount
  );

  checkSmartContractBalances(balances, shortTx, closeAmount);
  checkLenderBalances(balances, interestFee, shortTx, closeAmount);
  expect(balances.sellerUnderlyingToken).to.be.bignumber.equal(
    shortTx.shortAmount
      .plus(getMaxInterestFee(shortTx))
      .minus(underlyingTokenOwedToLender)
  );

  expect(balances.sellerBaseToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      shortTx.shortAmount,
      shortTx.depositAmount
    )
      .plus(baseTokenFromSell)
  );
}

async function getShortLifetime(shortTx, closeTx) {
  const [shortTimestamp, shortClosedTimestamp] = await Promise.all([
    getBlockTimestamp(shortTx.response.receipt.blockNumber),
    getBlockTimestamp(closeTx.receipt.blockNumber)
  ]);
  const maxDuration = shortTx.loanOffering.maxDuration;
  let duration = shortClosedTimestamp - shortTimestamp;
  if (duration > maxDuration) {
    duration = maxDuration;
  }
  return duration;
}
