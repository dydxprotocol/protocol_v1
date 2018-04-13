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
const { getMaxInterestFee } = require('./MarginHelper');

module.exports = {
  checkSuccess,
  checkSmartContractBalances,
  checkLenderBalances,
  getOwedAmount,
  getBalances,
  checkSuccessCloseDirectly,
  getPositionLifetime
};

async function checkSuccess(margin, openTx, closeTx, sellOrder, closeAmount) {
  const baseTokenOwedToLender = await getOwedAmount(openTx, closeTx, closeAmount);
  const quoteTokenFromSell = getPartialAmount(
    openTx.buyOrder.makerTokenAmount,
    openTx.buyOrder.takerTokenAmount,
    closeAmount
  );
  const quoteTokenBuybackCost = getPartialAmount(
    sellOrder.takerTokenAmount,
    sellOrder.makerTokenAmount,
    baseTokenOwedToLender
  );

  const balances = await getBalances(margin, openTx, sellOrder);
  const {
    traderQuoteToken,
    externalTraderQuoteToken,
    externalTraderBaseToken,
    traderFeeToken,
    externalTraderFeeToken,
    feeRecipientFeeToken
  } = balances;

  checkSmartContractBalances(balances, openTx, closeAmount);
  checkLenderBalances(balances, baseTokenOwedToLender, openTx);

  expect(traderQuoteToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      openTx.amount,
      openTx.depositAmount
    ).plus(quoteTokenFromSell)
      .minus(quoteTokenBuybackCost)
  );
  expect(externalTraderQuoteToken).to.be.bignumber.equal(quoteTokenBuybackCost);
  expect(externalTraderBaseToken).to.be.bignumber.equal(
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
  expect(traderFeeToken).to.be.bignumber.equal(
    openTx.buyOrder.takerFee
      .plus(openTx.loanOffering.rates.takerFee)
      .plus(sellOrder.takerFee)
      .minus(
        getPartialAmount(
          openTx.amount,
          openTx.loanOffering.rates.maxAmount,
          openTx.loanOffering.rates.takerFee
        )
      )
      .minus(
        getPartialAmount(
          openTx.amount,
          openTx.buyOrder.takerTokenAmount,
          openTx.buyOrder.takerFee
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
  expect(externalTraderFeeToken).to.be.bignumber.equal(
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

function checkSmartContractBalances(balances, openTx, closeAmount) {
  const startingQuoteTokenAmount = getPartialAmount(
    openTx.buyOrder.makerTokenAmount,
    openTx.buyOrder.takerTokenAmount,
    openTx.amount
  ).plus(openTx.depositAmount);
  const expectedBalance = getPartialAmount(
    openTx.amount.minus(closeAmount),
    openTx.amount,
    startingQuoteTokenAmount
  );

  const {
    vaultFeeToken,
    vaultQuoteToken,
    vaultBaseToken,
    positionBalance
  } = balances;

  expect(vaultFeeToken).to.be.bignumber.equal(0);
  expect(vaultQuoteToken).to.be.bignumber.equal(expectedBalance);
  expect(vaultBaseToken).to.be.bignumber.equal(0);
  expect(positionBalance).to.be.bignumber.equal(expectedBalance);
}

function checkLenderBalances(balances, baseTokenOwedToLender, openTx) {
  const {
    lenderQuoteToken,
    lenderBaseToken,
  } = balances;
  expect(lenderQuoteToken).to.be.bignumber.equal(0);
  expect(lenderBaseToken).to.be.bignumber.equal(
    openTx.loanOffering.rates.maxAmount
      .minus(openTx.amount)
      .plus(baseTokenOwedToLender));
}

async function getOwedAmount(openTx, closeTx, closeAmount, roundUpToPeriod = true) {
  let positionLifetime = await getPositionLifetime(openTx, closeTx);
  let interestPeriod = openTx.loanOffering.rates.interestPeriod;
  if (interestPeriod.gt(1)) {
    positionLifetime = getPartialAmount(
      positionLifetime, interestPeriod, 1, roundUpToPeriod).times(interestPeriod);
  }

  await TestInterestImpl.link('InterestImpl', InterestImpl.address);
  const interestCalc = await TestInterestImpl.new();

  const getOwedAmount = await interestCalc.getCompoundedInterest.call(
    closeAmount,
    openTx.loanOffering.rates.interestRate,
    positionLifetime
  );
  return getOwedAmount;
}

async function getBalances(margin, openTx, sellOrder) {
  const [
    baseToken,
    quoteToken,
    feeToken
  ] = await Promise.all([
    BaseToken.deployed(),
    QuoteToken.deployed(),
    FeeToken.deployed(),
  ]);

  let externalTraderQuoteToken,
    externalTraderBaseToken,
    externalTraderFeeToken,
    feeRecipientFeeToken;

  if (sellOrder) {
    [
      externalTraderQuoteToken,
      externalTraderBaseToken,
      externalTraderFeeToken,
      feeRecipientFeeToken,
    ] = await Promise.all([
      quoteToken.balanceOf.call(sellOrder.maker),
      baseToken.balanceOf.call(sellOrder.maker),
      feeToken.balanceOf.call(sellOrder.maker),
      feeToken.balanceOf.call(sellOrder.feeRecipient),
    ]);
  }

  const [
    traderQuoteToken,
    traderBaseToken,

    lenderQuoteToken,
    lenderBaseToken,

    traderFeeToken,

    vaultFeeToken,
    vaultQuoteToken,
    vaultBaseToken,

    positionBalance
  ] = await Promise.all([
    quoteToken.balanceOf.call(openTx.trader),
    baseToken.balanceOf.call(openTx.trader),

    quoteToken.balanceOf.call(openTx.loanOffering.payer),
    baseToken.balanceOf.call(openTx.loanOffering.payer),

    feeToken.balanceOf.call(openTx.trader),

    feeToken.balanceOf.call(Vault.address),
    quoteToken.balanceOf.call(Vault.address),
    baseToken.balanceOf.call(Vault.address),

    margin.getPositionBalance.call(openTx.id)
  ]);

  return {
    traderQuoteToken,
    traderBaseToken,

    lenderQuoteToken,
    lenderBaseToken,

    externalTraderQuoteToken,
    externalTraderBaseToken,
    externalTraderFeeToken,
    traderFeeToken,

    feeRecipientFeeToken,

    vaultFeeToken,
    vaultQuoteToken,
    vaultBaseToken,

    positionBalance
  };
}

async function checkSuccessCloseDirectly(margin, openTx, closeTx, closeAmount) {
  const baseTokenOwedToLender = await getOwedAmount(openTx, closeTx, closeAmount);
  const balances = await getBalances(margin, openTx);
  const quoteTokenFromSell = getPartialAmount(
    openTx.buyOrder.makerTokenAmount,
    openTx.buyOrder.takerTokenAmount,
    closeAmount
  );

  checkSmartContractBalances(balances, openTx, closeAmount);
  checkLenderBalances(balances, baseTokenOwedToLender, openTx);
  const maxInterest = await getMaxInterestFee(openTx);
  expect(balances.traderBaseToken).to.be.bignumber.equal(
    openTx.amount
      .plus(maxInterest)
      .minus(baseTokenOwedToLender)
  );

  expect(balances.traderQuoteToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      openTx.amount,
      openTx.depositAmount
    )
      .plus(quoteTokenFromSell)
  );
}

async function getPositionLifetime(openTx, tx) {
  const [openTimestamp, positionClosedTimestamp] = await Promise.all([
    getBlockTimestamp(openTx.response.receipt.blockNumber),
    getBlockTimestamp(tx.receipt.blockNumber)
  ]);
  const maxDuration = openTx.loanOffering.maxDuration;
  let duration = positionClosedTimestamp - openTimestamp;
  if (duration > maxDuration) {
    duration = maxDuration;
  }
  return new BigNumber(duration);
}
