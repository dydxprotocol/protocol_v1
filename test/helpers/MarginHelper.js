/*global artifacts, web3*/

const expect = require('chai').expect;
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const ProxyContract = artifacts.require("Proxy");
const Vault = artifacts.require("Vault");
const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const { BIGNUMBERS, DEFAULT_SALT } = require('./Constants');
const ZeroExExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const { zeroExOrderToBytes } = require('./BytesHelper');
const { createSignedBuyOrder } = require('./0xHelper');
const { transact } = require('./ContractHelper');
const { expectLog } = require('./EventHelper');
const { createLoanOffering } = require('./LoanHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { getBlockTimestamp } = require('./NodeHelper');

const web3Instance = new Web3(web3.currentProvider);

BigNumber.config({ DECIMAL_PLACES: 80 });

async function createOpenTx(accounts, _salt = DEFAULT_SALT, depositInHeldToken = true) {
  const [loanOffering, buyOrder] = await Promise.all([
    createLoanOffering(accounts, _salt),
    createSignedBuyOrder(accounts, _salt)
  ]);

  const tx = {
    owner: accounts[0],
    owedToken: OwedToken.address,
    heldToken: HeldToken.address,
    principal: BIGNUMBERS.BASE_AMOUNT,
    depositAmount: BIGNUMBERS.BASE_AMOUNT.times(new BigNumber(2)),
    loanOffering: loanOffering,
    buyOrder: buyOrder,
    trader: accounts[0],
    exchangeWrapper: ZeroExExchangeWrapper.address,
    depositInHeldToken: depositInHeldToken
  };

  return tx;
}

async function callOpenPosition(dydxMargin, tx, safely = true) {
  const positionId = web3Instance.utils.soliditySha3(
    tx.loanOffering.loanHash,
    0
  );

  let contains = await dydxMargin.containsPosition.call(positionId);
  if (safely) {
    expect(contains).to.be.false;
  }

  const addresses = [
    tx.owner,
    tx.loanOffering.owedToken,
    tx.loanOffering.heldToken,
    tx.loanOffering.payer,
    tx.loanOffering.signer,
    tx.loanOffering.owner,
    tx.loanOffering.taker,
    tx.loanOffering.feeRecipient,
    tx.loanOffering.lenderFeeTokenAddress,
    tx.loanOffering.takerFeeTokenAddress,
    tx.exchangeWrapper
  ];

  const values256 = [
    tx.loanOffering.rates.maxAmount,
    tx.loanOffering.rates.minAmount,
    tx.loanOffering.rates.minHeldToken,
    tx.loanOffering.rates.lenderFee,
    tx.loanOffering.rates.takerFee,
    tx.loanOffering.expirationTimestamp,
    tx.loanOffering.salt,
    tx.principal,
    tx.depositAmount
  ];

  const values32 = [
    tx.loanOffering.callTimeLimit,
    tx.loanOffering.maxDuration,
    tx.loanOffering.rates.interestRate,
    tx.loanOffering.rates.interestPeriod
  ];

  const sigV = tx.loanOffering.signature.v;

  const sigRS = [
    tx.loanOffering.signature.r,
    tx.loanOffering.signature.s,
  ];

  const order = zeroExOrderToBytes(tx.buyOrder);

  let response = await dydxMargin.openPosition(
    addresses,
    values256,
    values32,
    sigV,
    sigRS,
    tx.depositInHeldToken,
    order,
    { from: tx.trader }
  );

  if (safely) {
    contains = await dydxMargin.containsPosition.call(positionId);
    expect(contains).to.be.true;
  }

  await expectLogOpenPosition(dydxMargin, positionId, tx, response);

  response.id = positionId;
  return response;
}

async function expectLogOpenPosition(dydxMargin, positionId, tx, response) {
  let soldAmount = tx.principal;
  if (!tx.depositInHeldToken) {
    soldAmount = soldAmount.plus(tx.depositAmount)
  }
  const expectedHeldTokenFromSell = soldAmount
    .div(tx.buyOrder.takerTokenAmount)
    .times(tx.buyOrder.makerTokenAmount);

  expectLog(response.logs[0], 'PositionOpened', {
    positionId: positionId,
    trader: tx.trader,
    lender: tx.loanOffering.payer,
    loanHash: tx.loanOffering.loanHash,
    owedToken: tx.loanOffering.owedToken,
    heldToken: tx.loanOffering.heldToken,
    loanFeeRecipient: tx.loanOffering.feeRecipient,
    principal: tx.principal,
    heldTokenFromSell: expectedHeldTokenFromSell,
    depositAmount: tx.depositAmount,
    interestRate: tx.loanOffering.rates.interestRate,
    callTimeLimit: tx.loanOffering.callTimeLimit,
    maxDuration: tx.loanOffering.maxDuration,
    depositInHeldToken: tx.depositInHeldToken
  });

  const newOwner = await dydxMargin.getPositionOwner.call(positionId);
  const newLender = await dydxMargin.getPositionLender.call(positionId);
  let logIndex = 0;
  if (tx.loanOffering.owner !== tx.loanOffering.payer) {
    expectLog(response.logs[++logIndex], 'LoanTransferred', {
      positionId: positionId,
      from: tx.loanOffering.payer,
      to: tx.loanOffering.owner
    });
    if (newLender !== tx.loanOffering.owner) {
      expectLog(response.logs[++logIndex], 'LoanTransferred', {
        positionId: positionId,
        from: tx.loanOffering.owner,
        to: newLender
      });
    }
  }
  if (tx.owner !== tx.trader) {
    expectLog(response.logs[++logIndex], 'PositionTransferred', {
      positionId: positionId,
      from: tx.trader,
      to: tx.owner
    });
    if (newOwner !== tx.owner) {
      expectLog(response.logs[++logIndex], 'PositionTransferred', {
        positionId: positionId,
        from: tx.owner,
        to: newOwner
      });
    }
  }
}

async function callIncreasePosition(dydxMargin, tx) {
  const positionId = tx.id;

  const addresses = [
    tx.loanOffering.payer,
    tx.loanOffering.signer,
    tx.loanOffering.taker,
    tx.loanOffering.feeRecipient,
    tx.loanOffering.lenderFeeTokenAddress,
    tx.loanOffering.takerFeeTokenAddress,
    tx.exchangeWrapper
  ];

  const values256 = [
    tx.loanOffering.rates.maxAmount,
    tx.loanOffering.rates.minAmount,
    tx.loanOffering.rates.minHeldToken,
    tx.loanOffering.rates.lenderFee,
    tx.loanOffering.rates.takerFee,
    tx.loanOffering.expirationTimestamp,
    tx.loanOffering.salt,
    tx.principal
  ];

  const values32 = [
    tx.loanOffering.callTimeLimit,
    tx.loanOffering.maxDuration
  ];

  const sigV = tx.loanOffering.signature.v;

  const sigRS = [
    tx.loanOffering.signature.r,
    tx.loanOffering.signature.s,
  ];

  const order = zeroExOrderToBytes(tx.buyOrder);

  let response = await dydxMargin.increasePosition(
    positionId,
    addresses,
    values256,
    values32,
    sigV,
    sigRS,
    tx.depositInHeldToken,
    order,
    { from: tx.trader }
  );

  await expectIncreasePositionLog(
    dydxMargin,
    tx,
    response
  );

  response.id = positionId;
  return response;
}

async function expectIncreasePositionLog(dydxMargin, tx, response) {
  const positionId = tx.id;
  const [time1, time2, principal, heldTokenAmount] = await Promise.all([
    dydxMargin.getPositionStartTimestamp.call(positionId),
    getBlockTimestamp(response.receipt.blockNumber),
    dydxMargin.getPositionPrincipal.call(positionId),
    dydxMargin.getPositionBalance.call(positionId)
  ]);
  const owed = await getOwedAmountForTime(
    new BigNumber(time2).minus(time1),
    tx.loanOffering.rates.interestPeriod,
    tx.loanOffering.rates.interestRate,
    tx.principal,
    false
  );
  const minTotalDeposit = getPartialAmount(
    heldTokenAmount,
    principal,
    tx.principal
  );
  const heldTokenFromSell = tx.depositInHeldToken ?
    getPartialAmount(
      owed,
      tx.buyOrder.takerTokenAmount,
      tx.buyOrder.makerTokenAmount
    )
    : minTotalDeposit;
  const depositAmount = tx.depositInHeldToken ?
    minTotalDeposit.minus(heldTokenFromSell)
    : getPartialAmount(
      tx.buyOrder.takerTokenAmount,
      tx.buyOrder.makerTokenAmount,
      minTotalDeposit,
      true
    ).minus(owed);

  expectLog(response.logs[0], 'PositionIncreased', {
    positionId: positionId,
    trader: tx.trader,
    lender: tx.loanOffering.payer,
    positionOwner: tx.owner,
    loanOwner: tx.loanOffering.owner,
    loanHash: tx.loanOffering.loanHash,
    loanFeeRecipient: tx.loanOffering.feeRecipient,
    amountBorrowed: owed,
    principalAdded: tx.principal,
    heldTokenFromSell,
    depositAmount,
    depositInHeldToken: tx.depositInHeldToken
  });
}

async function issueTokensAndSetAllowances(tx) {
  const [owedToken, heldToken, feeToken] = await Promise.all([
    OwedToken.deployed(),
    HeldToken.deployed(),
    FeeToken.deployed()
  ]);

  const depositToken = tx.depositInHeldToken ? heldToken : owedToken;

  await Promise.all([
    owedToken.issueTo(
      tx.loanOffering.payer,
      tx.loanOffering.rates.maxAmount
    ),
    depositToken.issueTo(
      tx.trader,
      tx.depositAmount
    ),
    heldToken.issueTo(
      tx.buyOrder.maker,
      tx.buyOrder.makerTokenAmount
    ),
    feeToken.issueTo(
      tx.buyOrder.maker,
      tx.buyOrder.makerFee
    ),
    feeToken.issueTo(
      tx.loanOffering.payer,
      tx.loanOffering.rates.lenderFee
    ),
    feeToken.issueTo(
      tx.trader,
      tx.loanOffering.rates.takerFee.plus(tx.buyOrder.takerFee)
    ),
    owedToken.approve(
      ProxyContract.address,
      tx.loanOffering.rates.maxAmount,
      { from: tx.loanOffering.payer }
    ),
    depositToken.approve(
      ProxyContract.address,
      tx.depositAmount,
      { from: tx.trader }
    ),
    heldToken.approve(
      ZeroExProxy.address,
      tx.buyOrder.makerTokenAmount,
      { from: tx.buyOrder.maker }
    ),
    feeToken.approve(
      ZeroExProxy.address,
      tx.buyOrder.makerFee,
      { from: tx.buyOrder.maker }
    ),
    feeToken.approve(
      ProxyContract.address,
      tx.loanOffering.rates.lenderFee,
      { from: tx.loanOffering.payer }
    ),
    feeToken.approve(
      ProxyContract.address,
      tx.loanOffering.rates.takerFee,
      { from: tx.trader }
    ),
    feeToken.approve(
      ZeroExExchangeWrapper.address,
      tx.buyOrder.takerFee,
      { from: tx.trader }
    )
  ]);
}

async function doOpenPosition(
  accounts,
  _salt = DEFAULT_SALT,
  positionOwner = null
) {
  const [OpenTx, dydxMargin] = await Promise.all([
    createOpenTx(accounts, _salt),
    Margin.deployed()
  ]);

  await issueTokensAndSetAllowances(OpenTx);

  if (positionOwner) {
    OpenTx.owner = positionOwner;
  }

  const response = await callOpenPosition(dydxMargin, OpenTx);

  OpenTx.id = response.id;
  OpenTx.response = response;
  return OpenTx;
}

async function callClosePosition(
  dydxMargin,
  OpenTx,
  sellOrder,
  closeAmount,
  {
    from,
    recipient,
    payoutInHeldToken = true
  } = {}
) {
  const closer = from || OpenTx.trader;
  recipient = recipient || closer;

  const {
    startAmount,
    startHeldToken,
    startTimestamp,
    startTotalOwedTokenRepaid,
    startLenderOwedToken,
    owedToken,
    positionLender
  } = await getPreCloseVariables(dydxMargin, OpenTx.id);

  const tx = await transact(
    dydxMargin.closePosition,
    OpenTx.id,
    closeAmount,
    recipient,
    ZeroExExchangeWrapper.address,
    payoutInHeldToken,
    zeroExOrderToBytes(sellOrder),
    { from: closer }
  );

  await expectCloseLog(
    dydxMargin,
    {
      OpenTx,
      sellOrder,
      closer,
      payoutInHeldToken,
      recipient,
      startAmount,
      startHeldToken,
      startTimestamp,
      startTotalOwedTokenRepaid,
      startLenderOwedToken,
      positionLender,
      owedToken,
      tx
    }
  );

  return tx;
}

async function callClosePositionDirectly(
  dydxMargin,
  OpenTx,
  closeAmount,
  from = null,
  recipient = null
) {
  const closer = from || OpenTx.trader;
  recipient = recipient || closer;

  const {
    startAmount,
    startHeldToken,
    startTimestamp,
    startTotalOwedTokenRepaid,
    startLenderOwedToken,
    owedToken,
    positionLender,
  } = await getPreCloseVariables(dydxMargin, OpenTx.id);

  const tx = await transact(
    dydxMargin.closePositionDirectly,
    OpenTx.id,
    closeAmount,
    recipient,
    { from: closer }
  );

  await expectCloseLog(
    dydxMargin,
    {
      OpenTx,
      closer,
      payoutInHeldToken: true,
      recipient,
      startAmount,
      startHeldToken,
      startTimestamp,
      startTotalOwedTokenRepaid,
      startLenderOwedToken,
      owedToken,
      positionLender,
      tx
    }
  );

  return tx;
}

async function getPreCloseVariables(dydxMargin, positionId) {
  const [
    owedToken,
    positionLender
  ] = await Promise.all([
    OwedToken.deployed(),
    dydxMargin.getPositionLender.call(positionId)
  ]);
  const [
    startAmount,
    startHeldToken,
    startTimestamp,
    startTotalOwedTokenRepaid,
    startLenderOwedToken
  ] = await Promise.all([
    dydxMargin.getPositionPrincipal.call(positionId),
    dydxMargin.getPositionBalance.call(positionId),
    dydxMargin.getPositionStartTimestamp.call(positionId),
    dydxMargin.getTotalOwedTokenRepaidToLender.call(positionId),
    owedToken.balanceOf.call(positionLender)
  ]);
  return {
    startAmount,
    startHeldToken,
    startTimestamp,
    startTotalOwedTokenRepaid,
    startLenderOwedToken,
    owedToken,
    positionLender
  }
}

async function expectCloseLog(dydxMargin, params) {
  const [
    endAmount,
    endTimestamp,
    endTotalOwedTokenRepaid,
    endLenderOwedToken
  ] = await Promise.all([
    dydxMargin.getPositionPrincipal.call(params.OpenTx.id),
    getBlockTimestamp(params.tx.receipt.blockNumber),
    dydxMargin.getTotalOwedTokenRepaidToLender.call(params.OpenTx.id),
    params.owedToken.balanceOf.call(params.positionLender)
  ]);
  const actualCloseAmount = params.startAmount.minus(endAmount);

  const owed = await getOwedAmountForTime(
    new BigNumber(endTimestamp).minus(params.startTimestamp),
    params.OpenTx.loanOffering.rates.interestPeriod,
    params.OpenTx.loanOffering.rates.interestRate,
    actualCloseAmount,
    true
  );

  const availableHeldToken = getPartialAmount(
    actualCloseAmount,
    params.startAmount,
    params.startHeldToken
  );

  let buybackCost = 0;
  let payoutAmount = availableHeldToken;
  let owedTokenPaidToLender = owed;

  if (params.sellOrder) {
    if (params.payoutInHeldToken) {
      buybackCost = getPartialAmount(
        owed,
        params.sellOrder.makerTokenAmount,
        params.sellOrder.takerTokenAmount,
        true // round up
      );
    } else {
      buybackCost = availableHeldToken;
    }

    const owedTokenFromSell = getPartialAmount(
      buybackCost,
      params.sellOrder.takerTokenAmount,
      params.sellOrder.makerTokenAmount
    );

    if (params.payoutInHeldToken) {
      owedTokenPaidToLender = owedTokenFromSell;
      payoutAmount = availableHeldToken.minus(buybackCost);
    } else {
      payoutAmount = owedTokenFromSell.minus(owedTokenPaidToLender);
    }
  }

  expect(
    owedTokenPaidToLender
  ).to.be.bignumber.equal(
    endTotalOwedTokenRepaid.minus(params.startTotalOwedTokenRepaid)
  ).to.be.bignumber.equal(
    endLenderOwedToken.minus(params.startLenderOwedToken)
  );

  expectLog(params.tx.logs[0], 'PositionClosed', {
    positionId: params.OpenTx.id,
    closer: params.closer,
    payoutRecipient: params.recipient,
    closeAmount: actualCloseAmount,
    remainingAmount: params.startAmount.minus(actualCloseAmount),
    owedTokenPaidToLender,
    payoutAmount,
    buybackCost,
    payoutInHeldToken: params.payoutInHeldToken
  });
}

async function callLiquidatePosition(
  dydxMargin,
  OpenTx,
  liquidateAmount,
  from,
  payoutRecipient = null
) {
  const startAmount = await dydxMargin.getPositionPrincipal.call(OpenTx.id);
  const startHeldToken = await dydxMargin.getPositionBalance.call(OpenTx.id);

  payoutRecipient = payoutRecipient || from
  const tx = await transact(
    dydxMargin.liquidatePosition,
    OpenTx.id,
    liquidateAmount,
    payoutRecipient,
    { from: from }
  );

  const actualLiquidateAmount = BigNumber.min(startAmount, liquidateAmount);

  expectLog(tx.logs[0], 'PositionLiquidated', {
    positionId: OpenTx.id,
    liquidator: from,
    payoutRecipient: payoutRecipient,
    liquidatedAmount: actualLiquidateAmount,
    remainingAmount: startAmount.minus(actualLiquidateAmount),
    heldTokenPayout: actualLiquidateAmount.times(startHeldToken).div(startAmount)
  });

  return tx;
}

async function callCancelLoanOffer(
  dydxMargin,
  loanOffering,
  cancelAmount,
  from = null
) {
  const { addresses, values256, values32 } = formatLoanOffering(loanOffering);

  const canceledAmount1 = await dydxMargin.loanCancels.call(loanOffering.loanHash);
  const tx = await dydxMargin.cancelLoanOffering(
    addresses,
    values256,
    values32,
    cancelAmount,
    { from: from || loanOffering.payer }
  );
  const canceledAmount2 = await dydxMargin.loanCancels.call(loanOffering.loanHash);

  const expectedCanceledAmount = BigNumber.min(
    canceledAmount1.plus(cancelAmount),
    loanOffering.rates.maxAmount
  );
  expect(canceledAmount2).to.be.bignumber.equal(expectedCanceledAmount);

  expectLog(tx.logs[0], 'LoanOfferingCanceled', {
    loanHash: loanOffering.loanHash,
    lender: loanOffering.payer,
    feeRecipient: loanOffering.feeRecipient,
    cancelAmount: canceledAmount2.minus(canceledAmount1)
  });

  return tx;
}

async function callApproveLoanOffering(
  dydxMargin,
  loanOffering,
  from = null
) {
  const { addresses, values256, values32 } = formatLoanOffering(loanOffering);

  const wasApproved = await dydxMargin.isLoanApproved.call(loanOffering.loanHash);

  const tx = await dydxMargin.approveLoanOffering(
    addresses,
    values256,
    values32,
    { from: from || loanOffering.payer }
  );

  const approved = await dydxMargin.isLoanApproved.call(loanOffering.loanHash);
  expect(approved).to.be.true;

  if (!wasApproved) {
    expectLog(tx.logs[0], 'LoanOfferingApproved', {
      loanHash: loanOffering.loanHash,
      lender: loanOffering.payer,
      feeRecipient: loanOffering.feeRecipient
    });
  }

  return tx;
}

function formatLoanOffering(loanOffering) {
  const addresses = [
    loanOffering.owedToken,
    loanOffering.heldToken,
    loanOffering.payer,
    loanOffering.signer,
    loanOffering.owner,
    loanOffering.taker,
    loanOffering.feeRecipient,
    FeeToken.address,
    FeeToken.address
  ];

  const values256 = [
    loanOffering.rates.maxAmount,
    loanOffering.rates.minAmount,
    loanOffering.rates.minHeldToken,
    loanOffering.rates.lenderFee,
    loanOffering.rates.takerFee,
    loanOffering.expirationTimestamp,
    loanOffering.salt,
  ];

  const values32 = [
    loanOffering.callTimeLimit,
    loanOffering.maxDuration,
    loanOffering.rates.interestRate,
    loanOffering.rates.interestPeriod
  ];

  return { addresses, values256, values32 };
}

async function issueTokensAndSetAllowancesForClose(OpenTx, sellOrder) {
  const [owedToken, feeToken] = await Promise.all([
    OwedToken.deployed(),
    FeeToken.deployed(),
  ]);

  await Promise.all([
    owedToken.issueTo(
      sellOrder.maker,
      sellOrder.makerTokenAmount
    ),
    feeToken.issueTo(
      OpenTx.trader,
      sellOrder.takerFee
    ),
    feeToken.issueTo(
      sellOrder.maker,
      sellOrder.makerFee
    ),
    owedToken.approve(
      ZeroExProxy.address,
      sellOrder.makerTokenAmount,
      { from: sellOrder.maker }
    ),
    feeToken.approve(
      ZeroExProxy.address,
      sellOrder.makerFee,
      { from: sellOrder.maker }
    ),
    feeToken.approve(
      ZeroExExchangeWrapper.address,
      sellOrder.takerFee,
      { from: OpenTx.trader }
    )
  ]);
}

async function getPosition(dydxMargin, id) {
  const [
    [
      owedToken,
      heldToken,
      lender,
      owner
    ],
    [
      principal,
      requiredDeposit
    ],
    [
      callTimeLimit,
      startTimestamp,
      callTimestamp,
      maxDuration,
      interestRate,
      interestPeriod
    ]
  ] = await dydxMargin.getPosition.call(id);

  return {
    owedToken,
    heldToken,
    principal,
    interestRate,
    requiredDeposit,
    callTimeLimit,
    startTimestamp,
    callTimestamp,
    maxDuration,
    interestPeriod,
    lender,
    owner
  };
}

async function doOpenPositionAndCall(
  accounts,
  _salt = DEFAULT_SALT,
  _requiredDeposit = new BigNumber(10)
) {
  const [dydxMargin, vault, owedToken] = await Promise.all([
    Margin.deployed(),
    Vault.deployed(),
    OwedToken.deployed()
  ]);

  const OpenTx = await doOpenPosition(accounts, _salt);

  const callTx = await dydxMargin.marginCall(
    OpenTx.id,
    _requiredDeposit,
    { from: OpenTx.loanOffering.payer }
  );

  return { dydxMargin, vault, owedToken, OpenTx, callTx };
}

async function issueForDirectClose(OpenTx) {
  const owedToken = await OwedToken.deployed();

  // Issue to the trader the maximum amount of owedToken they could have to pay

  const maxInterestFee = await getMaxInterestFee(OpenTx);
  const maxOwedTokenOwed = OpenTx.principal.plus(maxInterestFee);

  await Promise.all([
    owedToken.issueTo(
      OpenTx.trader,
      maxOwedTokenOwed
    ),
    owedToken.approve(
      ProxyContract.address,
      maxOwedTokenOwed,
      { from: OpenTx.trader }
    )
  ]);
}

async function getMaxInterestFee(OpenTx) {
  await TestInterestImpl.link('InterestImpl', InterestImpl.address);
  const interestCalc = await TestInterestImpl.new();

  const interest = await interestCalc.getCompoundedInterest.call(
    OpenTx.principal,
    OpenTx.loanOffering.rates.interestRate,
    OpenTx.loanOffering.maxDuration
  );
  return interest;
}

async function getOwedAmountForTime(
  timeDiff,
  interestPeriod,
  interestRate,
  amount,
  roundUpToPeriod = true
) {
  if (interestPeriod.gt(1)) {
    timeDiff = getPartialAmount(
      timeDiff, interestPeriod, 1, roundUpToPeriod).times(interestPeriod);
  }

  await TestInterestImpl.link('InterestImpl', InterestImpl.address);
  const interestCalc = await TestInterestImpl.new();
  const owedAmount = await interestCalc.getCompoundedInterest.call(
    amount,
    interestRate,
    timeDiff
  );
  return owedAmount;
}

async function issueTokenToAccountInAmountAndApproveProxy(token, account, amount) {
  await Promise.all([
    token.issueTo(account, amount),
    token.approve(ProxyContract.address, amount, { from: account })
  ]);
}

module.exports = {
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition,
  doOpenPosition,
  issueTokensAndSetAllowancesForClose,
  callCancelLoanOffer,
  callClosePosition,
  callClosePositionDirectly,
  callLiquidatePosition,
  getPosition,
  doOpenPositionAndCall,
  issueForDirectClose,
  callApproveLoanOffering,
  issueTokenToAccountInAmountAndApproveProxy,
  getMaxInterestFee,
  callIncreasePosition
};
