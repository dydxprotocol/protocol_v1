/*global artifacts*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const Vault = artifacts.require("Vault");
const QuoteToken = artifacts.require("TokenA");
const BaseToken = artifacts.require("TokenB");
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
  getShortLifetime
};

async function checkSuccess(shortSell, shortTx, closeTx, sellOrder, closeAmount) {
  const baseTokenOwedToLender = await getOwedAmount(shortTx, closeTx, closeAmount);
  const quoteTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    closeAmount
  );
  const quoteTokenBuybackCost = getPartialAmount(
    sellOrder.takerTokenAmount,
    sellOrder.makerTokenAmount,
    baseTokenOwedToLender
  );

  const balances = await getBalances(shortSell, shortTx, sellOrder);
  const {
    sellerQuoteToken,
    externalSellerQuoteToken,
    externalSellerBaseToken,
    sellerFeeToken,
    externalSellerFeeToken,
    feeRecipientFeeToken
  } = balances;

  checkSmartContractBalances(balances, shortTx, closeAmount);
  checkLenderBalances(balances, baseTokenOwedToLender, shortTx);

  expect(sellerQuoteToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      shortTx.shortAmount,
      shortTx.depositAmount
    ).plus(quoteTokenFromSell)
      .minus(quoteTokenBuybackCost)
  );
  expect(externalSellerQuoteToken).to.be.bignumber.equal(quoteTokenBuybackCost);
  expect(externalSellerBaseToken).to.be.bignumber.equal(
    sellOrder.makerTokenAmount.minus(baseTokenOwedToLender)
  );
  expect(feeRecipientFeeToken).to.be.bignumber.equal(
    getPartialAmount(
      baseTokenOwedToLender,
      sellOrder.makerTokenAmount,
      sellOrder.takerFee
    ).plus(
      getPartialAmount(
        baseTokenOwedToLender,
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
          baseTokenOwedToLender,
          sellOrder.makerTokenAmount,
          sellOrder.takerFee
        )
      )
  );
  expect(externalSellerFeeToken).to.be.bignumber.equal(
    sellOrder.makerFee
      .minus(
        getPartialAmount(
          baseTokenOwedToLender,
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
    vaultBaseToken,
    shortBalance
  } = balances;

  expect(vaultFeeToken).to.be.bignumber.equal(0);
  expect(vaultQuoteToken).to.be.bignumber.equal(expectedShortBalance);
  expect(vaultBaseToken).to.be.bignumber.equal(0);
  expect(shortBalance).to.be.bignumber.equal(expectedShortBalance);
}

function checkLenderBalances(balances, baseTokenOwedToLender, shortTx) {
  const {
    lenderQuoteToken,
    lenderBaseToken,
  } = balances;
  expect(lenderQuoteToken).to.be.bignumber.equal(0);
  expect(lenderBaseToken).to.be.bignumber.equal(
    shortTx.loanOffering.rates.maxAmount
      .minus(shortTx.shortAmount)
      .plus(baseTokenOwedToLender));
}

async function getOwedAmount(shortTx, closeTx, closeAmount, roundUpToPeriod = true) {
  let shortLifetime = await getShortLifetime(shortTx, closeTx);
  let interestPeriod = shortTx.loanOffering.rates.interestPeriod;
  if (interestPeriod.gt(1)) {
    shortLifetime = getPartialAmount(
      shortLifetime, interestPeriod, 1, roundUpToPeriod).times(interestPeriod);
  }

  await TestInterestImpl.link('InterestImpl', InterestImpl.address);
  const interestCalc = await TestInterestImpl.new();

  const getOwedAmount = await interestCalc.getCompoundedInterest.call(
    closeAmount,
    shortTx.loanOffering.rates.interestRate,
    shortLifetime
  );
  return getOwedAmount;
}

async function getBalances(shortSell, shortTx, sellOrder) {
  const [
    baseToken,
    quoteToken,
    feeToken
  ] = await Promise.all([
    BaseToken.deployed(),
    QuoteToken.deployed(),
    FeeToken.deployed(),
  ]);

  let externalSellerQuoteToken,
    externalSellerBaseToken,
    externalSellerFeeToken,
    feeRecipientFeeToken;

  if (sellOrder) {
    [
      externalSellerQuoteToken,
      externalSellerBaseToken,
      externalSellerFeeToken,
      feeRecipientFeeToken,
    ] = await Promise.all([
      quoteToken.balanceOf.call(sellOrder.maker),
      baseToken.balanceOf.call(sellOrder.maker),
      feeToken.balanceOf.call(sellOrder.maker),
      feeToken.balanceOf.call(sellOrder.feeRecipient),
    ]);
  }

  const [
    sellerQuoteToken,
    sellerBaseToken,

    lenderQuoteToken,
    lenderBaseToken,

    sellerFeeToken,

    vaultFeeToken,
    vaultQuoteToken,
    vaultBaseToken,

    shortBalance
  ] = await Promise.all([
    quoteToken.balanceOf.call(shortTx.seller),
    baseToken.balanceOf.call(shortTx.seller),

    quoteToken.balanceOf.call(shortTx.loanOffering.payer),
    baseToken.balanceOf.call(shortTx.loanOffering.payer),

    feeToken.balanceOf.call(shortTx.seller),

    feeToken.balanceOf.call(Vault.address),
    quoteToken.balanceOf.call(Vault.address),
    baseToken.balanceOf.call(Vault.address),

    shortSell.getShortBalance.call(shortTx.id)
  ]);

  return {
    sellerQuoteToken,
    sellerBaseToken,

    lenderQuoteToken,
    lenderBaseToken,

    externalSellerQuoteToken,
    externalSellerBaseToken,
    externalSellerFeeToken,
    sellerFeeToken,

    feeRecipientFeeToken,

    vaultFeeToken,
    vaultQuoteToken,
    vaultBaseToken,

    shortBalance
  };
}

async function checkSuccessCloseDirectly(shortSell, shortTx, closeTx, closeAmount) {
  const baseTokenOwedToLender = await getOwedAmount(shortTx, closeTx, closeAmount);
  const balances = await getBalances(shortSell, shortTx);
  const quoteTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    closeAmount
  );

  checkSmartContractBalances(balances, shortTx, closeAmount);
  checkLenderBalances(balances, baseTokenOwedToLender, shortTx);
  const maxInterest = await getMaxInterestFee(shortTx);
  expect(balances.sellerBaseToken).to.be.bignumber.equal(
    shortTx.shortAmount
      .plus(maxInterest)
      .minus(baseTokenOwedToLender)
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

async function getShortLifetime(shortTx, tx) {
  const [shortTimestamp, shortClosedTimestamp] = await Promise.all([
    getBlockTimestamp(shortTx.response.receipt.blockNumber),
    getBlockTimestamp(tx.receipt.blockNumber)
  ]);
  const maxDuration = shortTx.loanOffering.maxDuration;
  let duration = shortClosedTimestamp - shortTimestamp;
  if (duration > maxDuration) {
    duration = maxDuration;
  }
  return new BigNumber(duration);
}
