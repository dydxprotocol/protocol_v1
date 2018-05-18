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
const { DEFAULT_SALT, ORDER_TYPE, BYTES } = require('./Constants');
const ZeroExExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const { zeroExOrderToBytes } = require('./BytesHelper');
const { createSignedBuyOrder, createSignedSellOrder } = require('./ZeroExHelper');
const { transact } = require('./ContractHelper');
const { expectLog } = require('./EventHelper');
const { createLoanOffering } = require('./LoanHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { getBlockTimestamp } = require('./NodeHelper');
const { issueAndSetAllowance } = require('./TokenHelper');

const web3Instance = new Web3(web3.currentProvider);

BigNumber.config({ DECIMAL_PLACES: 80 });

async function createOpenTx(
  accounts,
  {
    salt = DEFAULT_SALT,
    depositInHeldToken = true,
    positionOwner,
    interestPeriod
  } = {}
) {
  const [loanOffering, buyOrder] = await Promise.all([
    createLoanOffering(accounts, { salt, interestPeriod }),
    createSignedBuyOrder(accounts, { salt })
  ]);

  const tx = {
    owner: positionOwner || accounts[0],
    owedToken: OwedToken.address,
    heldToken: HeldToken.address,
    principal: new BigNumber('1098765932109876544'),
    loanOffering: loanOffering,
    buyOrder: buyOrder,
    trader: accounts[0],
    exchangeWrapper: ZeroExExchangeWrapper.address,
    depositInHeldToken: depositInHeldToken,
  };
  tx.depositAmount = getMinimumDeposit(tx);

  return tx;
}

function getMinimumDeposit(openTx) {
  let minimumDeposit;

  const totalCollateralRequired = getPartialAmount(
    openTx.principal,
    openTx.loanOffering.rates.maxAmount,
    openTx.loanOffering.rates.minHeldToken,
    true
  );

  if (openTx.depositInHeldToken) {
    const heldTokenFromSell = getPartialAmount(
      openTx.principal,
      openTx.buyOrder.takerTokenAmount,
      openTx.buyOrder.makerTokenAmount
    );
    minimumDeposit = totalCollateralRequired.minus(heldTokenFromSell);
  } else {
    const owedTokenNeededToSell = getPartialAmount(
      totalCollateralRequired,
      openTx.buyOrder.makerTokenAmount,
      openTx.buyOrder.takerTokenAmount,
      true
    );
    minimumDeposit = owedTokenNeededToSell.minus(openTx.principal);
  }

  expect(minimumDeposit).to.be.bignumber.gt(0);
  return minimumDeposit;
}

function orderToBytes(order) {
  switch (order.type) {
  case ORDER_TYPE.ZERO_EX: {
    return zeroExOrderToBytes(order);
  }
  case ORDER_TYPE.KYBER: {
    return null;
  }
  case ORDER_TYPE.DIRECT: {
    return BYTES.EMPTY;
  }
  default:
    return null;
  }
}

async function callOpenPosition(dydxMargin, tx) {
  const loanNumber = await dydxMargin.getLoanNumber.call(tx.loanOffering.loanHash);
  const positionId = web3Instance.utils.soliditySha3(
    tx.loanOffering.loanHash,
    loanNumber
  );

  let contains = await dydxMargin.containsPosition.call(positionId);
  expect(contains).to.be.false;

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

  const order = orderToBytes(tx.buyOrder);

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

  contains = await dydxMargin.containsPosition.call(positionId);
  expect(contains).to.be.true;

  await expectLogOpenPosition(dydxMargin, positionId, tx, response);

  response.id = positionId;
  return response;
}

function getExpectedHeldTokenFromSell(tx) {
  switch (tx.buyOrder.type){
  case ORDER_TYPE.ZERO_EX: {
    let soldAmount = tx.principal;
    if (!tx.depositInHeldToken) {
      soldAmount = soldAmount.plus(tx.depositAmount)
    }
    return getPartialAmount(
      soldAmount,
      tx.buyOrder.takerTokenAmount,
      tx.buyOrder.makerTokenAmount
    );
  }
  case ORDER_TYPE.KYBER: {
    return null;
  }
  case ORDER_TYPE.DIRECT: {
    return new BigNumber(0);
  }
  default:
    return null;
  }
}

async function expectLogOpenPosition(dydxMargin, positionId, tx, response) {
  const expectedHeldTokenFromSell = getExpectedHeldTokenFromSell(tx);

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

  const [principal, balance] = await Promise.all([
    dydxMargin.getPositionPrincipal.call(positionId),
    dydxMargin.getPositionBalance.call(positionId)
  ]);

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
    response,
    { principal, balance }
  );

  response.id = positionId;
  return response;
}

async function expectIncreasePositionLog(dydxMargin, tx, response, start) {
  const positionId = tx.id;
  const [time1, time2, principal, endingBalance] = await Promise.all([
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
    endingBalance,
    principal,
    tx.principal,
    true
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

  const youMustAddThisMuchCollateralToPosition = getPartialAmount(
    owed,
    tx.loanOffering.rates.maxAmount,
    tx.loanOffering.rates.minHeldToken,
    true
  );
  expect(endingBalance.minus(start.balance)).to.be.bignumber.gte(
    youMustAddThisMuchCollateralToPosition
  );
}

async function issueTokensAndSetAllowances(tx) {
  const [owedToken, heldToken, feeToken] = await Promise.all([
    OwedToken.deployed(),
    HeldToken.deployed(),
    FeeToken.deployed()
  ]);

  const depositToken = tx.depositInHeldToken ? heldToken : owedToken;

  await Promise.all([
    // Loan Payer Owed Token
    issueAndSetAllowance(
      owedToken,
      tx.loanOffering.payer,
      tx.loanOffering.rates.maxAmount,
      ProxyContract.address
    ),

    // Trader Deposit
    issueAndSetAllowance(
      depositToken,
      tx.trader,
      tx.depositAmount,
      ProxyContract.address
    ),

    // Buy Order Maker Held Token
    issueAndSetAllowance(
      heldToken,
      tx.buyOrder.maker,
      tx.buyOrder.makerTokenAmount,
      ZeroExProxy.address
    ),

    // Buy Order Maker Fee
    issueAndSetAllowance(
      feeToken,
      tx.buyOrder.maker,
      tx.buyOrder.makerFee,
      ZeroExProxy.address
    ),

    // Loan Payer Fee
    issueAndSetAllowance(
      feeToken,
      tx.loanOffering.payer,
      tx.loanOffering.rates.lenderFee,
      ProxyContract.address
    ),

    // Trader Loan Fee
    issueAndSetAllowance(
      feeToken,
      tx.trader,
      tx.loanOffering.rates.takerFee,
      ProxyContract.address
    ),

    // Trader Buy Order Fee
    issueAndSetAllowance(
      feeToken,
      tx.trader,
      tx.buyOrder.takerFee,
      ZeroExExchangeWrapper.address
    ),
  ]);
}

async function doOpenPosition(
  accounts,
  {
    salt = DEFAULT_SALT,
    positionOwner,
    interestPeriod
  } = {}
) {
  const [OpenTx, dydxMargin] = await Promise.all([
    createOpenTx(accounts, { salt, positionOwner, interestPeriod }),
    Margin.deployed()
  ]);

  await issueTokensAndSetAllowances(OpenTx);

  const response = await callOpenPosition(dydxMargin, OpenTx);

  OpenTx.id = response.id;
  OpenTx.response = response;
  return OpenTx;
}

async function doClosePosition(
  accounts,
  openTx,
  closeAmount,
  {
    salt = DEFAULT_SALT,
    callCloseArgs = {}
  } = {}
) {
  const [sellOrder, dydxMargin] = await Promise.all([
    createSignedSellOrder(accounts, { salt }),
    Margin.deployed()
  ]);
  await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
  let closeTx = await callClosePosition(dydxMargin, openTx, sellOrder, closeAmount, callCloseArgs);
  return closeTx;
}

async function callClosePosition(
  dydxMargin,
  OpenTx,
  sellOrder,
  closeAmount,
  {
    from,
    recipient,
    payoutInHeldToken = true,
    exchangeWrapper = ZeroExExchangeWrapper.address
  } = {}
) {
  const closer = from || OpenTx.trader;
  recipient = recipient || closer;

  const addresses = await getAddresses(dydxMargin, OpenTx.id);

  const start = await getStartVariables(addresses, OpenTx.id);

  const tx = await transact(
    dydxMargin.closePosition,
    OpenTx.id,
    closeAmount,
    recipient,
    exchangeWrapper,
    payoutInHeldToken,
    zeroExOrderToBytes(sellOrder),
    { from: closer }
  );

  await expectCloseLog(
    addresses,
    start,
    {
      OpenTx,
      sellOrder,
      closer,
      payoutInHeldToken,
      recipient,
      tx
    }
  );

  return tx;
}

async function callClosePositionDirectly(
  dydxMargin,
  OpenTx,
  closeAmount,
  {
    from = null,
    recipient = null
  } = {}
) {
  const closer = from || OpenTx.trader;
  recipient = recipient || closer;

  const addresses = await getAddresses(dydxMargin, OpenTx.id);

  const start = await getStartVariables(addresses, OpenTx.id);

  const tx = await transact(
    dydxMargin.closePositionDirectly,
    OpenTx.id,
    closeAmount,
    recipient,
    { from: closer }
  );

  await expectCloseLog(
    addresses,
    start,
    {
      OpenTx,
      closer,
      payoutInHeldToken: true,
      recipient,
      tx
    }
  );

  return tx;
}

async function getAddresses(dydxMargin, positionId) {
  const [
    heldToken,
    owedToken,
    lender
  ] = await Promise.all([
    HeldToken.deployed(),
    OwedToken.deployed(),
    dydxMargin.getPositionLender.call(positionId)
  ]);
  return {
    dydxMargin,
    heldToken,
    owedToken,
    lender,
  };
}

async function getStartVariables(addresses, positionId) {
  const [
    principal,
    balance,
    timestamp,
    totalOwedTokenRepaid,
    lenderOwedToken
  ] = await Promise.all([
    addresses.dydxMargin.getPositionPrincipal.call(positionId),
    addresses.dydxMargin.getPositionBalance.call(positionId),
    addresses.dydxMargin.getPositionStartTimestamp.call(positionId),
    addresses.dydxMargin.getTotalOwedTokenRepaidToLender.call(positionId),
    addresses.owedToken.balanceOf.call(addresses.lender)
  ]);
  return {
    principal,
    balance,
    timestamp,
    totalOwedTokenRepaid,
    lenderOwedToken,
  }
}

async function expectCloseLog(addresses, start, params) {
  const [
    endAmount,
    endTimestamp,
    endTotalOwedTokenRepaid,
    endLenderOwedToken,
  ] = await Promise.all([
    addresses.dydxMargin.getPositionPrincipal.call(params.OpenTx.id),
    getBlockTimestamp(params.tx.receipt.blockNumber),
    addresses.dydxMargin.getTotalOwedTokenRepaidToLender.call(params.OpenTx.id),
    addresses.owedToken.balanceOf.call(addresses.lender),
  ]);
  const actualCloseAmount = start.principal.minus(endAmount);

  const owed = await getOwedAmountForTime(
    new BigNumber(endTimestamp).minus(start.timestamp),
    params.OpenTx.loanOffering.rates.interestPeriod,
    params.OpenTx.loanOffering.rates.interestRate,
    actualCloseAmount,
    true
  );

  const availableHeldToken = getPartialAmount(
    actualCloseAmount,
    start.principal,
    start.balance
  );

  let buybackCostInHeldToken = 0;
  let payoutAmount = availableHeldToken;
  let owedTokenPaidToLender = owed;

  if (params.sellOrder) {
    if (params.payoutInHeldToken) {
      buybackCostInHeldToken = getPartialAmount(
        owed,
        params.sellOrder.makerTokenAmount,
        params.sellOrder.takerTokenAmount,
        true // round up
      );
    } else {
      buybackCostInHeldToken = availableHeldToken;
    }

    const owedTokenFromSell = getPartialAmount(
      buybackCostInHeldToken,
      params.sellOrder.takerTokenAmount,
      params.sellOrder.makerTokenAmount
    );

    if (params.payoutInHeldToken) {
      owedTokenPaidToLender = owedTokenFromSell;
      payoutAmount = availableHeldToken.minus(buybackCostInHeldToken);
    } else {
      payoutAmount = owedTokenFromSell.minus(owedTokenPaidToLender);
    }
  }

  expect(
    owedTokenPaidToLender
  ).to.be.bignumber.equal(
    endTotalOwedTokenRepaid.minus(start.totalOwedTokenRepaid)
  ).to.be.bignumber.equal(
    endLenderOwedToken.minus(start.lenderOwedToken)
  );

  expectLog(params.tx.logs[0], 'PositionClosed', {
    positionId: params.OpenTx.id,
    closer: params.closer,
    payoutRecipient: params.recipient,
    closeAmount: actualCloseAmount,
    remainingAmount: start.principal.minus(actualCloseAmount),
    owedTokenPaidToLender,
    payoutAmount,
    buybackCostInHeldToken,
    payoutInHeldToken: params.payoutInHeldToken
  });

  expect(params.tx.result[0]).to.be.bignumber.equal(actualCloseAmount);
  expect(params.tx.result[1]).to.be.bignumber.equal(payoutAmount);
  expect(params.tx.result[2]).to.be.bignumber.equal(owedTokenPaidToLender);
}

async function callCloseWithoutCounterparty(
  dydxMargin,
  OpenTx,
  closeAmount,
  from,
  payoutRecipient = null
) {
  const [startAmount, startHeldToken] = await Promise.all([
    dydxMargin.getPositionPrincipal.call(OpenTx.id),
    dydxMargin.getPositionBalance.call(OpenTx.id)
  ]);

  payoutRecipient = payoutRecipient || from;
  const tx = await transact(
    dydxMargin.closeWithoutCounterparty,
    OpenTx.id,
    closeAmount,
    payoutRecipient,
    { from }
  );

  const endAmount = await dydxMargin.getPositionPrincipal.call(OpenTx.id);

  const actualCloseAmount = startAmount.minus(endAmount);

  expectLog(tx.logs[0], 'PositionClosed', {
    positionId: OpenTx.id,
    closer: from,
    payoutRecipient: payoutRecipient,
    closeAmount: actualCloseAmount,
    remainingAmount: startAmount.minus(actualCloseAmount),
    owedTokenPaidToLender: 0,
    payoutAmount: getPartialAmount(actualCloseAmount, startAmount, startHeldToken),
    buybackCostInHeldToken: 0,
    payoutInHeldToken: true
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

  const canceledAmount1 = await dydxMargin.getLoanCanceledAmount.call(loanOffering.loanHash);
  const tx = await dydxMargin.cancelLoanOffering(
    addresses,
    values256,
    values32,
    cancelAmount,
    { from: from || loanOffering.payer }
  );
  const canceledAmount2 = await dydxMargin.getLoanCanceledAmount.call(loanOffering.loanHash);

  const expectedCanceledAmount = BigNumber.min(
    canceledAmount1.plus(cancelAmount),
    loanOffering.rates.maxAmount
  );
  expect(canceledAmount2).to.be.bignumber.equal(expectedCanceledAmount);

  if (
    !canceledAmount1.equals(loanOffering.rates.maxAmount)
    && !(new BigNumber(cancelAmount).equals(0))
  ) {
    expectLog(tx.logs[0], 'LoanOfferingCanceled', {
      loanHash: loanOffering.loanHash,
      lender: loanOffering.payer,
      feeRecipient: loanOffering.feeRecipient,
      cancelAmount: canceledAmount2.minus(canceledAmount1)
    });
  } else {
    expect(tx.logs.length).to.eq(0);
  }

  return tx;
}

async function callApproveLoanOffering(
  dydxMargin,
  loanOffering,
  from
) {
  const { addresses, values256, values32 } = formatLoanOffering(loanOffering);

  const wasApproved = await dydxMargin.isLoanApproved.call(loanOffering.loanHash);

  const tx = await dydxMargin.approveLoanOffering(
    addresses,
    values256,
    values32,
    { from }
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
    // Sell Order Owed Token
    issueAndSetAllowance(
      owedToken,
      sellOrder.maker,
      sellOrder.makerTokenAmount,
      ZeroExProxy.address
    ),

    // Trader Sell Order Taker Fee
    issueAndSetAllowance(
      feeToken,
      OpenTx.trader,
      sellOrder.takerFee,
      ZeroExExchangeWrapper.address
    ),

    // Sell Order Maker Fee
    issueAndSetAllowance(
      feeToken,
      sellOrder.maker,
      sellOrder.makerFee,
      ZeroExProxy.address
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
  {
    requiredDeposit = new BigNumber(10),
    salt = DEFAULT_SALT,
  } = {}
) {
  const [dydxMargin, vault, owedToken] = await Promise.all([
    Margin.deployed(),
    Vault.deployed(),
    OwedToken.deployed()
  ]);

  const OpenTx = await doOpenPosition(accounts, { salt });

  const callTx = await dydxMargin.marginCall(
    OpenTx.id,
    requiredDeposit,
    { from: OpenTx.loanOffering.payer }
  );

  return { dydxMargin, vault, owedToken, OpenTx, callTx };
}

async function issueForDirectClose(OpenTx) {
  const owedToken = await OwedToken.deployed();

  // Issue to the trader the maximum amount of owedToken they could have to pay

  const maxInterestFee = await getMaxInterestFee(OpenTx);
  const maxOwedTokenOwed = OpenTx.principal.plus(maxInterestFee);

  await issueAndSetAllowance(
    owedToken,
    OpenTx.trader,
    maxOwedTokenOwed,
    ProxyContract.address
  );
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

function getTokenAmountsFromOpen(openTx) {
  let soldAmount = openTx.principal;
  if (!openTx.depositInHeldToken) {
    soldAmount = soldAmount.plus(openTx.depositAmount)
  }
  const expectedHeldTokenFromSell = getPartialAmount(
    soldAmount,
    openTx.buyOrder.takerTokenAmount,
    openTx.buyOrder.makerTokenAmount
  );

  const expectedHeldTokenBalance = openTx.depositInHeldToken ?
    expectedHeldTokenFromSell.plus(openTx.depositAmount)
    : expectedHeldTokenFromSell;

  return {
    soldAmount,
    expectedHeldTokenFromSell,
    expectedHeldTokenBalance
  };
}

async function issueTokenToAccountInAmountAndApproveProxy(token, account, amount) {
  await issueAndSetAllowance(
    token,
    account,
    amount,
    ProxyContract.address
  );
}

module.exports = {
  createOpenTx,
  getMinimumDeposit,
  issueTokensAndSetAllowances,
  callOpenPosition,
  doOpenPosition,
  doClosePosition,
  issueTokensAndSetAllowancesForClose,
  callCancelLoanOffer,
  callClosePosition,
  callClosePositionDirectly,
  callCloseWithoutCounterparty,
  getPosition,
  doOpenPositionAndCall,
  issueForDirectClose,
  callApproveLoanOffering,
  issueTokenToAccountInAmountAndApproveProxy,
  getMaxInterestFee,
  callIncreasePosition,
  getTokenAmountsFromOpen
};
