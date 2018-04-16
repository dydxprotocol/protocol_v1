/*global artifacts*/

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

async function checkSuccess(dydxMargin, OpenTx, closeTx, sellOrder, closeAmount) {
  const owedTokenOwedToLender = await getOwedAmount(OpenTx, closeTx, closeAmount);
  const heldTokenFromSell = getPartialAmount(
    OpenTx.buyOrder.makerTokenAmount,
    OpenTx.buyOrder.takerTokenAmount,
    closeAmount
  );
  const heldTokenBuybackCost = getPartialAmount(
    sellOrder.takerTokenAmount,
    sellOrder.makerTokenAmount,
    owedTokenOwedToLender
  );

  const balances = await getBalances(dydxMargin, OpenTx, sellOrder);
  const {
    traderHeldToken,
    externalEntityHeldToken,
    externalEntityOwedToken,
    traderFeeToken,
    externalEntityFeeToken,
    feeRecipientFeeToken
  } = balances;

  checkSmartContractBalances(balances, OpenTx, closeAmount);
  checkLenderBalances(balances, owedTokenOwedToLender, OpenTx);

  expect(traderHeldToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      OpenTx.principal,
      OpenTx.depositAmount
    ).plus(heldTokenFromSell)
      .minus(heldTokenBuybackCost)
  );
  expect(externalEntityHeldToken).to.be.bignumber.equal(heldTokenBuybackCost);
  expect(externalEntityOwedToken).to.be.bignumber.equal(
    sellOrder.makerTokenAmount.minus(owedTokenOwedToLender)
  );
  expect(feeRecipientFeeToken).to.be.bignumber.equal(
    getPartialAmount(
      owedTokenOwedToLender,
      sellOrder.makerTokenAmount,
      sellOrder.takerFee
    ).plus(
      getPartialAmount(
        owedTokenOwedToLender,
        sellOrder.makerTokenAmount,
        sellOrder.makerFee
      )
    )
  );
  expect(traderFeeToken).to.be.bignumber.equal(
    OpenTx.buyOrder.takerFee
      .plus(OpenTx.loanOffering.rates.takerFee)
      .plus(sellOrder.takerFee)
      .minus(
        getPartialAmount(
          OpenTx.principal,
          OpenTx.loanOffering.rates.maxAmount,
          OpenTx.loanOffering.rates.takerFee
        )
      )
      .minus(
        getPartialAmount(
          OpenTx.principal,
          OpenTx.buyOrder.takerTokenAmount,
          OpenTx.buyOrder.takerFee
        )
      )
      .minus(
        getPartialAmount(
          owedTokenOwedToLender,
          sellOrder.makerTokenAmount,
          sellOrder.takerFee
        )
      )
  );
  expect(externalEntityFeeToken).to.be.bignumber.equal(
    sellOrder.makerFee
      .minus(
        getPartialAmount(
          owedTokenOwedToLender,
          sellOrder.makerTokenAmount,
          sellOrder.makerFee
        )
      )
  );
}

function checkSmartContractBalances(balances, OpenTx, closeAmount) {
  const startingHeldTokenAmount = getPartialAmount(
    OpenTx.buyOrder.makerTokenAmount,
    OpenTx.buyOrder.takerTokenAmount,
    OpenTx.principal
  ).plus(OpenTx.depositAmount);
  const expectedBalance = getPartialAmount(
    OpenTx.principal.minus(closeAmount),
    OpenTx.principal,
    startingHeldTokenAmount
  );

  const {
    vaultFeeToken,
    vaultHeldToken,
    vaultOwedToken,
    positionBalance
  } = balances;

  expect(vaultFeeToken).to.be.bignumber.equal(0);
  expect(vaultHeldToken).to.be.bignumber.equal(expectedBalance);
  expect(vaultOwedToken).to.be.bignumber.equal(0);
  expect(positionBalance).to.be.bignumber.equal(expectedBalance);
}

function checkLenderBalances(balances, owedTokenOwedToLender, OpenTx) {
  const {
    lenderHeldToken,
    lenderOwedToken,
  } = balances;
  expect(lenderHeldToken).to.be.bignumber.equal(0);
  expect(lenderOwedToken).to.be.bignumber.equal(
    OpenTx.loanOffering.rates.maxAmount
      .minus(OpenTx.principal)
      .plus(owedTokenOwedToLender));
}

async function getOwedAmount(OpenTx, closeTx, closeAmount, roundUpToPeriod = true) {
  let positionLifetime = await getPositionLifetime(OpenTx, closeTx);
  let interestPeriod = OpenTx.loanOffering.rates.interestPeriod;
  if (interestPeriod.gt(1)) {
    positionLifetime = getPartialAmount(
      positionLifetime, interestPeriod, 1, roundUpToPeriod).times(interestPeriod);
  }

  await TestInterestImpl.link('InterestImpl', InterestImpl.address);
  const interestCalc = await TestInterestImpl.new();

  const getOwedAmount = await interestCalc.getCompoundedInterest.call(
    closeAmount,
    OpenTx.loanOffering.rates.interestRate,
    positionLifetime
  );
  return getOwedAmount;
}

async function getBalances(dydxMargin, OpenTx, sellOrder) {
  const [
    owedToken,
    heldToken,
    feeToken
  ] = await Promise.all([
    OwedToken.deployed(),
    HeldToken.deployed(),
    FeeToken.deployed(),
  ]);

  let externalEntityHeldToken,
    externalEntityOwedToken,
    externalEntityFeeToken,
    feeRecipientFeeToken;

  if (sellOrder) {
    [
      externalEntityHeldToken,
      externalEntityOwedToken,
      externalEntityFeeToken,
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

    positionBalance
  ] = await Promise.all([
    heldToken.balanceOf.call(OpenTx.trader),
    owedToken.balanceOf.call(OpenTx.trader),

    heldToken.balanceOf.call(OpenTx.loanOffering.payer),
    owedToken.balanceOf.call(OpenTx.loanOffering.payer),

    feeToken.balanceOf.call(OpenTx.trader),

    feeToken.balanceOf.call(Vault.address),
    heldToken.balanceOf.call(Vault.address),
    owedToken.balanceOf.call(Vault.address),

    dydxMargin.getPositionBalance.call(OpenTx.id)
  ]);

  return {
    traderHeldToken,
    traderOwedToken,

    lenderHeldToken,
    lenderOwedToken,

    externalEntityHeldToken,
    externalEntityOwedToken,
    externalEntityFeeToken,
    traderFeeToken,

    feeRecipientFeeToken,

    vaultFeeToken,
    vaultHeldToken,
    vaultOwedToken,

    positionBalance
  };
}

async function checkSuccessCloseDirectly(dydxMargin, OpenTx, closeTx, closeAmount) {
  const owedTokenOwedToLender = await getOwedAmount(OpenTx, closeTx, closeAmount);
  const balances = await getBalances(dydxMargin, OpenTx);
  const heldTokenFromSell = getPartialAmount(
    OpenTx.buyOrder.makerTokenAmount,
    OpenTx.buyOrder.takerTokenAmount,
    closeAmount
  );

  checkSmartContractBalances(balances, OpenTx, closeAmount);
  checkLenderBalances(balances, owedTokenOwedToLender, OpenTx);
  const maxInterest = await getMaxInterestFee(OpenTx);
  expect(balances.traderOwedToken).to.be.bignumber.equal(
    OpenTx.principal
      .plus(maxInterest)
      .minus(owedTokenOwedToLender)
  );

  expect(balances.traderHeldToken).to.be.bignumber.equal(
    getPartialAmount(
      closeAmount,
      OpenTx.principal,
      OpenTx.depositAmount
    )
      .plus(heldTokenFromSell)
  );
}

async function getPositionLifetime(OpenTx, tx) {
  const [positionTimestamp, positionClosedTimestamp] = await Promise.all([
    getBlockTimestamp(OpenTx.response.receipt.blockNumber),
    getBlockTimestamp(tx.receipt.blockNumber)
  ]);
  const maxDuration = OpenTx.loanOffering.maxDuration;
  let duration = positionClosedTimestamp - positionTimestamp;
  if (duration > maxDuration) {
    duration = maxDuration;
  }
  return new BigNumber(duration);
}
