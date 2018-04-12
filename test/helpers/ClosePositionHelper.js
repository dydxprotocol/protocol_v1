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

async function checkSuccess(margin, OpenPositionTx, closeTx, sellOrder, closeAmount) {
  const baseTokenOwedToLender = await getOwedAmount(OpenPositionTx, closeTx, closeAmount);
  const quoteTokenFromSell = getPartialAmount(
    OpenPositionTx.buyOrder.makerTokenAmount,
    OpenPositionTx.buyOrder.takerTokenAmount,
    closeAmount
  );
  const quoteTokenBuybackCost = getPartialAmount(
    sellOrder.takerTokenAmount,
    sellOrder.makerTokenAmount,
    baseTokenOwedToLender
  );

  const balances = await getBalances(margin, OpenPositionTx, sellOrder);
  const {
    traderQuoteToken,
    externalTraderQuoteToken,
    externalTraderBaseToken,
    traderFeeToken,
    externalTraderFeeToken,
    feeRecipientFeeToken
  } = balances;

  checkSmartContractBalances(balances, OpenPositionTx, closeAmount);
  checkLenderBalances(balances, baseTokenOwedToLender, OpenPositionTx);

  expect(traderQuoteToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      OpenPositionTx.marginAmount,
      OpenPositionTx.depositAmount
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
    OpenPositionTx.buyOrder.takerFee
      .plus(OpenPositionTx.loanOffering.rates.takerFee)
      .plus(sellOrder.takerFee)
      .minus(
        getPartialAmount(
          OpenPositionTx.marginAmount,
          OpenPositionTx.loanOffering.rates.maxAmount,
          OpenPositionTx.loanOffering.rates.takerFee
        )
      )
      .minus(
        getPartialAmount(
          OpenPositionTx.marginAmount,
          OpenPositionTx.buyOrder.takerTokenAmount,
          OpenPositionTx.buyOrder.takerFee
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

function checkSmartContractBalances(balances, OpenPositionTx, closeAmount) {
  const startingQuoteTokenAmount = getPartialAmount(
    OpenPositionTx.buyOrder.makerTokenAmount,
    OpenPositionTx.buyOrder.takerTokenAmount,
    OpenPositionTx.marginAmount
  ).plus(OpenPositionTx.depositAmount);
  const expectedBalance = getPartialAmount(
    OpenPositionTx.marginAmount.minus(closeAmount),
    OpenPositionTx.marginAmount,
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

function checkLenderBalances(balances, baseTokenOwedToLender, OpenPositionTx) {
  const {
    lenderQuoteToken,
    lenderBaseToken,
  } = balances;
  expect(lenderQuoteToken).to.be.bignumber.equal(0);
  expect(lenderBaseToken).to.be.bignumber.equal(
    OpenPositionTx.loanOffering.rates.maxAmount
      .minus(OpenPositionTx.marginAmount)
      .plus(baseTokenOwedToLender));
}

async function getOwedAmount(OpenPositionTx, closeTx, closeAmount, roundUpToPeriod = true) {
  let positionLifetime = await getPositionLifetime(OpenPositionTx, closeTx);
  let interestPeriod = OpenPositionTx.loanOffering.rates.interestPeriod;
  if (interestPeriod.gt(1)) {
    positionLifetime = getPartialAmount(
      positionLifetime, interestPeriod, 1, roundUpToPeriod).times(interestPeriod);
  }

  await TestInterestImpl.link('InterestImpl', InterestImpl.address);
  const interestCalc = await TestInterestImpl.new();

  const getOwedAmount = await interestCalc.getCompoundedInterest.call(
    closeAmount,
    OpenPositionTx.loanOffering.rates.interestRate,
    positionLifetime
  );
  return getOwedAmount;
}

async function getBalances(margin, OpenPositionTx, sellOrder) {
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
    quoteToken.balanceOf.call(OpenPositionTx.trader),
    baseToken.balanceOf.call(OpenPositionTx.trader),

    quoteToken.balanceOf.call(OpenPositionTx.loanOffering.payer),
    baseToken.balanceOf.call(OpenPositionTx.loanOffering.payer),

    feeToken.balanceOf.call(OpenPositionTx.trader),

    feeToken.balanceOf.call(Vault.address),
    quoteToken.balanceOf.call(Vault.address),
    baseToken.balanceOf.call(Vault.address),

    margin.getPositionBalance.call(OpenPositionTx.id)
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

async function checkSuccessCloseDirectly(margin, OpenPositionTx, closeTx, closeAmount) {
  const baseTokenOwedToLender = await getOwedAmount(OpenPositionTx, closeTx, closeAmount);
  const balances = await getBalances(margin, OpenPositionTx);
  const quoteTokenFromSell = getPartialAmount(
    OpenPositionTx.buyOrder.makerTokenAmount,
    OpenPositionTx.buyOrder.takerTokenAmount,
    closeAmount
  );

  checkSmartContractBalances(balances, OpenPositionTx, closeAmount);
  checkLenderBalances(balances, baseTokenOwedToLender, OpenPositionTx);
  const maxInterest = await getMaxInterestFee(OpenPositionTx);
  expect(balances.traderBaseToken).to.be.bignumber.equal(
    OpenPositionTx.marginAmount
      .plus(maxInterest)
      .minus(baseTokenOwedToLender)
  );

  expect(balances.traderQuoteToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      OpenPositionTx.marginAmount,
      OpenPositionTx.depositAmount
    )
      .plus(quoteTokenFromSell)
  );
}

async function getPositionLifetime(OpenPositionTx, tx) {
  const [openTimestamp, positionClosedTimestamp] = await Promise.all([
    getBlockTimestamp(OpenPositionTx.response.receipt.blockNumber),
    getBlockTimestamp(tx.receipt.blockNumber)
  ]);
  const maxDuration = OpenPositionTx.loanOffering.maxDuration;
  let duration = positionClosedTimestamp - openTimestamp;
  if (duration > maxDuration) {
    duration = maxDuration;
  }
  return new BigNumber(duration);
}
