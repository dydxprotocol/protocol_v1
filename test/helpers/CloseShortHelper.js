/*global artifacts*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const Vault = artifacts.require("Vault");
const Trader = artifacts.require("Trader");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const { getPartialAmount, getQuotient3Over2 } = require('../helpers/ShortSellHelper');
const { BIGNUMBERS } = require('../helpers/Constants');
const { getBlockTimestamp } = require('../helpers/NodeHelper');

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
  const baseTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    closeAmount
  );
  const interestFee = await getInterestFee(shortTx, closeTx, closeAmount);
  const baseTokenBuybackCost = getPartialAmount(
    sellOrder.takerTokenAmount,
    sellOrder.makerTokenAmount,
    closeAmount
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
      .minus(interestFee)
  );
  expect(externalSellerBaseToken).to.be.bignumber.equal(baseTokenBuybackCost);
  expect(externalSellerUnderlyingToken).to.be.bignumber.equal(
    sellOrder.makerTokenAmount.minus(closeAmount)
  );
  expect(feeRecipientFeeToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      sellOrder.makerTokenAmount,
      sellOrder.takerFee
    ).plus(
      getPartialAmount(
        closeAmount,
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
          closeAmount,
          sellOrder.makerTokenAmount,
          sellOrder.takerFee
        )
      )
  );
  expect(externalSellerFeeToken).to.be.bignumber.equal(
    sellOrder.makerFee
      .minus(
        getPartialAmount(
          closeAmount,
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
    traderFeeToken,
    traderBaseToken,
    traderUnderlyingToken,
    shortBalance
  } = balances;

  expect(vaultFeeToken).to.be.bignumber.equal(0);
  expect(vaultBaseToken).to.be.bignumber.equal(expectedShortBalance);
  expect(vaultUnderlyingToken).to.be.bignumber.equal(0);
  expect(traderFeeToken).to.be.bignumber.equal(0);
  expect(traderBaseToken).to.be.bignumber.equal(0);
  expect(traderUnderlyingToken).to.be.bignumber.equal(0);
  expect(shortBalance).to.be.bignumber.equal(expectedShortBalance);
}

function checkLenderBalances(balances, interestFee, shortTx, closeAmount) {
  const {
    lenderBaseToken,
    lenderUnderlyingToken,
  } = balances;
  expect(lenderBaseToken).to.be.bignumber.equal(interestFee);
  expect(lenderUnderlyingToken).to.be.bignumber.equal(
    shortTx.loanOffering.rates.maxAmount
      .minus(shortTx.shortAmount)
      .plus(closeAmount)
  );
}

async function getInterestFee(shortTx, closeTx, closeAmount) {
  const shortLifetime = await getShortLifetime(shortTx, closeTx);
  const interestFee = getPartialAmount(
    shortTx.shortAmount,
    shortTx.loanOffering.rates.maxAmount,
    shortTx.loanOffering.rates.dailyInterestFee,
    true // roundsUp
  );
  return getQuotient3Over2(
    closeAmount,
    shortLifetime,
    interestFee,
    shortTx.shortAmount,
    BIGNUMBERS.ONE_DAY_IN_SECONDS,
    true // roundsUp
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

    traderFeeToken,
    traderBaseToken,
    traderUnderlyingToken,

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

    feeToken.balanceOf.call(Trader.address),
    baseToken.balanceOf.call(Trader.address),
    underlyingToken.balanceOf.call(Trader.address),

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

    traderFeeToken,
    traderBaseToken,
    traderUnderlyingToken,

    shortBalance
  };
}

async function checkSuccessCloseDirectly(shortSell, shortTx, closeTx, closeAmount) {
  const interestFee = await getInterestFee(shortTx, closeTx, closeAmount);
  const balances = await getBalances(shortSell, shortTx);
  const baseTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    closeAmount
  );

  checkSmartContractBalances(balances, shortTx, closeAmount);
  checkLenderBalances(balances, interestFee, shortTx, closeAmount);
  expect(balances.sellerUnderlyingToken).to.be.bignumber.equal(
    shortTx.shortAmount.minus(closeAmount)
  );

  expect(balances.sellerBaseToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      shortTx.shortAmount,
      shortTx.depositAmount
    )
      .plus(baseTokenFromSell)
      .minus(interestFee)
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
