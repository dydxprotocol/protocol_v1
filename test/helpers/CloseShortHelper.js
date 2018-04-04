/*global artifacts*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const Vault = artifacts.require("Vault");
const QuoteToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const { getPartialAmount } = require('../helpers/MathHelper');
const { getBlockTimestamp } = require('./NodeHelper');
const { getMaxInterestFee } = require('./ShortSellHelper');

module.exports = {
  checkSuccess,
  checkSmartContractBalances,
  checkLenderBalances,
  getOwedAmount,
  getBalances,
  checkSuccessCloseDirectly,
  getShortLifetime,
};

async function checkSuccess(shortSell, shortTx, closeTx, sellOrder, closeAmount) {
  const underlyingTokenOwedToLender = await getOwedAmount(shortTx, closeTx, closeAmount);
  const quoteTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    closeAmount
  );
  const quoteTokenBuybackCost = getPartialAmount(
    sellOrder.takerTokenAmount,
    sellOrder.makerTokenAmount,
    underlyingTokenOwedToLender
  );

  const balances = await getBalances(shortSell, shortTx, sellOrder);
  const {
    sellerQuoteToken,
    externalSellerQuoteToken,
    externalSellerUnderlyingToken,
    sellerFeeToken,
    externalSellerFeeToken,
    feeRecipientFeeToken
  } = balances;

  checkSmartContractBalances(balances, shortTx, closeAmount);
  checkLenderBalances(balances, underlyingTokenOwedToLender, shortTx);

  expect(sellerQuoteToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      shortTx.shortAmount,
      shortTx.depositAmount
    ).plus(quoteTokenFromSell)
      .minus(quoteTokenBuybackCost)
  );
  expect(externalSellerQuoteToken).to.be.bignumber.equal(quoteTokenBuybackCost);
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
  const startingShortQuoteTokenAmount = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    shortTx.shortAmount
  ).plus(shortTx.depositAmount);
  const expectedShortBalance = getPartialAmount(
    shortTx.shortAmount.minus(closeAmount),
    shortTx.shortAmount,
    startingShortQuoteTokenAmount
  );

  const {
    vaultFeeToken,
    vaultQuoteToken,
    vaultUnderlyingToken,
    shortBalance
  } = balances;

  expect(vaultFeeToken).to.be.bignumber.equal(0);
  expect(vaultQuoteToken).to.be.bignumber.equal(expectedShortBalance);
  expect(vaultUnderlyingToken).to.be.bignumber.equal(0);
  expect(shortBalance).to.be.bignumber.equal(expectedShortBalance);
}

function checkLenderBalances(balances, underlyingTokenOwedToLender, shortTx) {
  const {
    lenderQuoteToken,
    lenderUnderlyingToken,
  } = balances;
  expect(lenderQuoteToken).to.be.bignumber.equal(0);
  expect(lenderUnderlyingToken).to.be.bignumber.equal(
    shortTx.loanOffering.rates.maxAmount
      .minus(shortTx.shortAmount)
      .plus(underlyingTokenOwedToLender));
}

async function getOwedAmount(shortTx, closeTx, closeAmount) {
  let shortLifetime = await getShortLifetime(shortTx, closeTx);

  await TestInterestImpl.link('InterestImpl', InterestImpl.address);
  const interestCalc = await TestInterestImpl.new();

  const getOwedAmount = await interestCalc.getCompoundedInterest.call(
    closeAmount,
    shortTx.loanOffering.rates.interestRate,
    new BigNumber(shortLifetime),
    shortTx.loanOffering.rates.interestPeriod,
  );
  return getOwedAmount;
}

async function getBalances(shortSell, shortTx, sellOrder) {
  const [
    underlyingToken,
    quoteToken,
    feeToken
  ] = await Promise.all([
    UnderlyingToken.deployed(),
    QuoteToken.deployed(),
    FeeToken.deployed(),
  ]);

  let externalSellerQuoteToken,
    externalSellerUnderlyingToken,
    externalSellerFeeToken,
    feeRecipientFeeToken;

  if (sellOrder) {
    [
      externalSellerQuoteToken,
      externalSellerUnderlyingToken,
      externalSellerFeeToken,
      feeRecipientFeeToken,
    ] = await Promise.all([
      quoteToken.balanceOf.call(sellOrder.maker),
      underlyingToken.balanceOf.call(sellOrder.maker),
      feeToken.balanceOf.call(sellOrder.maker),
      feeToken.balanceOf.call(sellOrder.feeRecipient),
    ]);
  }

  const [
    sellerQuoteToken,
    sellerUnderlyingToken,

    lenderQuoteToken,
    lenderUnderlyingToken,

    sellerFeeToken,

    vaultFeeToken,
    vaultQuoteToken,
    vaultUnderlyingToken,

    shortBalance
  ] = await Promise.all([
    quoteToken.balanceOf.call(shortTx.seller),
    underlyingToken.balanceOf.call(shortTx.seller),

    quoteToken.balanceOf.call(shortTx.loanOffering.lender),
    underlyingToken.balanceOf.call(shortTx.loanOffering.lender),

    feeToken.balanceOf.call(shortTx.seller),

    feeToken.balanceOf.call(Vault.address),
    quoteToken.balanceOf.call(Vault.address),
    underlyingToken.balanceOf.call(Vault.address),

    shortSell.getShortBalance.call(shortTx.id)
  ]);

  return {
    sellerQuoteToken,
    sellerUnderlyingToken,

    lenderQuoteToken,
    lenderUnderlyingToken,

    externalSellerQuoteToken,
    externalSellerUnderlyingToken,
    externalSellerFeeToken,
    sellerFeeToken,

    feeRecipientFeeToken,

    vaultFeeToken,
    vaultQuoteToken,
    vaultUnderlyingToken,

    shortBalance
  };
}

async function checkSuccessCloseDirectly(shortSell, shortTx, closeTx, closeAmount) {
  const underlyingTokenOwedToLender = await getOwedAmount(shortTx, closeTx, closeAmount);
  const balances = await getBalances(shortSell, shortTx);
  const quoteTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    closeAmount
  );

  checkSmartContractBalances(balances, shortTx, closeAmount);
  checkLenderBalances(balances, underlyingTokenOwedToLender, shortTx);
  const maxInterest = await getMaxInterestFee(shortTx);
  expect(balances.sellerUnderlyingToken).to.be.bignumber.equal(
    shortTx.shortAmount
      .plus(maxInterest)
      .minus(underlyingTokenOwedToLender)
  );

  expect(balances.sellerQuoteToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      shortTx.shortAmount,
      shortTx.depositAmount
    )
      .plus(quoteTokenFromSell)
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
