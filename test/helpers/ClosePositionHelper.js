const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const Vault = artifacts.require("Vault");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const { getPartialAmount } = require('../helpers/MathHelper');
const { getBlockTimestamp } = require('./NodeHelper');

module.exports = {
  checkSuccess,
  checkSmartContractBalances,
  checkLenderBalances,
  getOwedAmount,
  getBalances,
  checkSuccessCloseDirectly,
  getPositionLifetime
};

async function checkSuccess(
  dydxMargin,
  openTx,
  closeTx,
  sellOrder,
  closeAmount,
  startingBalances,
  payoutInHeldToken = true
) {
  const [
    owedTokenOwedToLender,
    balances,
    exists,
    isClosed
  ] = await Promise.all([
    getOwedAmount(openTx, closeTx, closeAmount),
    getBalances(dydxMargin, openTx, sellOrder),
    dydxMargin.containsPosition.call(openTx.id),
    dydxMargin.isPositionClosed.call(openTx.id)
  ]);

  const expectedUsedHeldToken = getPartialAmount(
    closeAmount,
    startingBalances.positionPrincipal,
    startingBalances.positionBalance
  );

  const heldTokenBuybackCost = payoutInHeldToken ?
    getPartialAmount(
      sellOrder.takerTokenAmount,
      sellOrder.makerTokenAmount,
      owedTokenOwedToLender,
      true // round up
    ) : expectedUsedHeldToken;

  const owedTokenPaidToLender = payoutInHeldToken ? getPartialAmount(
    heldTokenBuybackCost,
    sellOrder.takerTokenAmount,
    sellOrder.makerTokenAmount,
  ) : owedTokenOwedToLender;

  const owedTokenFromSell = getPartialAmount(
    heldTokenBuybackCost,
    sellOrder.takerTokenAmount,
    sellOrder.makerTokenAmount
  );

  if (balances.positionBalance.equals(0)) {
    expect(exists).to.be.false;
    expect(isClosed).to.be.true;
  } else {
    expect(exists).to.be.true;
    expect(isClosed).to.be.false;
  }

  expect(owedTokenPaidToLender).to.be.bignumber.gte(owedTokenOwedToLender);

  checkSmartContractBalances(balances, startingBalances, expectedUsedHeldToken);
  checkLenderBalances(balances, startingBalances, owedTokenPaidToLender);
  checkTraderBalances(
    balances,
    startingBalances,
    sellOrder,
    closeAmount,
    heldTokenBuybackCost,
    owedTokenPaidToLender,
    expectedUsedHeldToken,
    owedTokenFromSell,
    owedTokenOwedToLender,
    payoutInHeldToken
  );
  checkMakerBalances(
    balances,
    startingBalances,
    sellOrder,
    heldTokenBuybackCost,
    owedTokenFromSell
  );

  expect(balances.feeRecipientFeeToken).to.be.bignumber.equal(
    startingBalances.feeRecipientFeeToken.plus(
      getPartialAmount(
        heldTokenBuybackCost,
        sellOrder.takerTokenAmount,
        sellOrder.takerFee
      )
    ).plus(
      getPartialAmount(
        heldTokenBuybackCost,
        sellOrder.takerTokenAmount,
        sellOrder.makerFee
      )
    )
  );
}

function checkSmartContractBalances(
  {
    vaultFeeToken,
    vaultHeldToken,
    vaultOwedToken,
    positionBalance
  },
  startingBalances,
  expectedUsedHeldToken,
) {
  expect(vaultFeeToken).to.be.bignumber.equal(startingBalances.vaultFeeToken);
  expect(vaultHeldToken).to.be.bignumber.equal(
    startingBalances.vaultHeldToken.minus(expectedUsedHeldToken)
  );
  expect(vaultOwedToken).to.be.bignumber.equal(startingBalances.vaultOwedToken);
  expect(positionBalance).to.be.bignumber.equal(
    startingBalances.positionBalance.minus(expectedUsedHeldToken)
  );
}

function checkLenderBalances(
  {
    lenderHeldToken,
    lenderOwedToken,
  },
  startingBalances,
  owedTokenOwedToLender
) {
  expect(lenderHeldToken).to.be.bignumber.equal(startingBalances.lenderHeldToken);
  expect(lenderOwedToken).to.be.bignumber.equal(
    startingBalances.lenderOwedToken.plus(owedTokenOwedToLender)
  );
}

function checkTraderBalances(
  {
    traderHeldToken,
    traderFeeToken,
    traderOwedToken
  },
  startingBalances,
  sellOrder,
  closeAmount,
  heldTokenBuybackCost,
  owedTokenPaidToLender,
  expectedUsedHeldToken,
  owedTokenFromSell,
  owedTokenOwedToLender,
  payoutInHeldToken
) {
  const expectedHeldTokenChange = payoutInHeldToken ?
    expectedUsedHeldToken.minus(heldTokenBuybackCost) : 0;

  // Trader Held Token
  expect(traderHeldToken).to.be.bignumber.equal(
    startingBalances.traderHeldToken.plus(expectedHeldTokenChange)
  );

  // Trader Owed Token
  expect(traderOwedToken).to.be.bignumber.equal(
    startingBalances.traderOwedToken.plus(owedTokenFromSell.minus(owedTokenOwedToLender))
  );

  // Trader Fee Token
  expect(traderFeeToken).to.be.bignumber.equal(
    startingBalances.traderFeeToken.minus(
      getPartialAmount(
        heldTokenBuybackCost,
        sellOrder.takerTokenAmount,
        sellOrder.takerFee
      )
    )
  );
}

function checkMakerBalances(
  { makerHeldToken, makerOwedToken, makerFeeToken },
  startingBalances,
  sellOrder,
  heldTokenBuybackCost,
  owedTokenFromSell
) {
  // Maker Held Token
  expect(makerHeldToken).to.be.bignumber.equal(
    startingBalances.makerHeldToken.plus(heldTokenBuybackCost)
  );

  // Maker Owed Token
  expect(makerOwedToken).to.be.bignumber.equal(
    startingBalances.makerOwedToken.minus(owedTokenFromSell)
  );

  // Maker Fee Token
  expect(makerFeeToken).to.be.bignumber.equal(
    startingBalances.makerFeeToken.minus(
      getPartialAmount(
        owedTokenFromSell,
        sellOrder.makerTokenAmount,
        sellOrder.makerFee
      )
    )
  );
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

async function getBalances(dydxMargin, openTx, sellOrder) {
  const [
    owedToken,
    heldToken,
    feeToken
  ] = await Promise.all([
    OwedToken.deployed(),
    HeldToken.deployed(),
    FeeToken.deployed(),
  ]);

  let makerHeldToken,
    makerOwedToken,
    makerFeeToken,
    feeRecipientFeeToken;

  if (sellOrder) {
    [
      makerHeldToken,
      makerOwedToken,
      makerFeeToken,
      feeRecipientFeeToken,
    ] = await Promise.all([
      heldToken.balanceOf.call(sellOrder.maker),
      owedToken.balanceOf.call(sellOrder.maker),
      feeToken.balanceOf.call(sellOrder.maker),
      feeToken.balanceOf.call(sellOrder.feeRecipient),
    ]);
  }

  const [
    traderHeldToken,
    traderOwedToken,

    lenderHeldToken,
    lenderOwedToken,

    traderFeeToken,

    vaultFeeToken,
    vaultHeldToken,
    vaultOwedToken,

    positionBalance,
    positionPrincipal
  ] = await Promise.all([
    heldToken.balanceOf.call(openTx.trader),
    owedToken.balanceOf.call(openTx.trader),

    heldToken.balanceOf.call(openTx.loanOffering.payer),
    owedToken.balanceOf.call(openTx.loanOffering.payer),

    feeToken.balanceOf.call(openTx.trader),

    feeToken.balanceOf.call(Vault.address),
    heldToken.balanceOf.call(Vault.address),
    owedToken.balanceOf.call(Vault.address),

    dydxMargin.getPositionBalance.call(openTx.id),
    dydxMargin.getPositionPrincipal.call(openTx.id),
  ]);

  return {
    traderHeldToken,
    traderOwedToken,

    lenderHeldToken,
    lenderOwedToken,

    makerHeldToken,
    makerOwedToken,
    makerFeeToken,
    traderFeeToken,

    feeRecipientFeeToken,

    vaultFeeToken,
    vaultHeldToken,
    vaultOwedToken,

    positionBalance,
    positionPrincipal
  };
}

async function checkSuccessCloseDirectly(
  dydxMargin,
  openTx,
  closeTx,
  closeAmount,
  startingBalances
) {
  const [
    balances,
    owedTokenOwedToLender
  ] = await Promise.all([
    getBalances(dydxMargin, openTx),
    getOwedAmount(openTx, closeTx, closeAmount)
  ]);

  const expectedUsedHeldToken = getPartialAmount(
    closeAmount,
    startingBalances.positionPrincipal,
    startingBalances.positionBalance
  );

  checkSmartContractBalances(balances, startingBalances, expectedUsedHeldToken);
  checkLenderBalances(balances, startingBalances, owedTokenOwedToLender);

  expect(balances.traderOwedToken).to.be.bignumber.equal(
    startingBalances.traderOwedToken.minus(owedTokenOwedToLender)
  );

  expect(balances.traderHeldToken).to.be.bignumber.equal(
    startingBalances.traderHeldToken.plus(expectedUsedHeldToken)
  );
}

async function getPositionLifetime(openTx, tx) {
  const [positionTimestamp, positionClosedTimestamp] = await Promise.all([
    getBlockTimestamp(openTx.response.receipt.blockNumber),
    getBlockTimestamp(tx.receipt.blockNumber)
  ]);
  const maxDuration = openTx.loanOffering.maxDuration;
  let duration = positionClosedTimestamp - positionTimestamp;
  if (duration > maxDuration) {
    duration = maxDuration;
  }
  return new BigNumber(duration);
}
