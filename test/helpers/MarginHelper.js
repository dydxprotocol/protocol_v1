/*global artifacts, web3*/

const expect = require('chai').expect;
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const QuoteToken = artifacts.require("TokenA");
const BaseToken = artifacts.require("TokenB");
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

async function createMarginTradeTx(accounts, _salt = DEFAULT_SALT) {
  const [loanOffering, buyOrder] = await Promise.all([
    createLoanOffering(accounts, _salt),
    createSignedBuyOrder(accounts, _salt)
  ]);

  const tx = {
    owner: accounts[0],
    baseToken: BaseToken.address,
    quoteToken: QuoteToken.address,
    marginAmount: BIGNUMBERS.BASE_AMOUNT,
    depositAmount: BIGNUMBERS.BASE_AMOUNT.times(new BigNumber(2)),
    loanOffering: loanOffering,
    buyOrder: buyOrder,
    trader: accounts[0],
    exchangeWrapperAddress: ZeroExExchangeWrapper.address
  };

  return tx;
}

async function callOpenPosition(margin, tx, safely = true) {
  const marginId = web3Instance.utils.soliditySha3(
    tx.loanOffering.loanHash,
    0
  );

  let contains = await margin.containsPosition.call(marginId);
  if (safely) {
    expect(contains).to.be.false;
  }

  const addresses = [
    tx.owner,
    tx.loanOffering.baseToken,
    tx.loanOffering.quoteToken,
    tx.loanOffering.payer,
    tx.loanOffering.signer,
    tx.loanOffering.owner,
    tx.loanOffering.taker,
    tx.loanOffering.feeRecipient,
    tx.loanOffering.lenderFeeTokenAddress,
    tx.loanOffering.takerFeeTokenAddress,
    tx.exchangeWrapperAddress
  ];

  const values256 = [
    tx.loanOffering.rates.maxAmount,
    tx.loanOffering.rates.minAmount,
    tx.loanOffering.rates.minQuoteToken,
    tx.loanOffering.rates.lenderFee,
    tx.loanOffering.rates.takerFee,
    tx.loanOffering.expirationTimestamp,
    tx.loanOffering.salt,
    tx.marginAmount,
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

  let response = await margin.openPosition(
    addresses,
    values256,
    values32,
    sigV,
    sigRS,
    true,
    order,
    { from: tx.trader }
  );

  if (safely) {
    contains = await margin.containsPosition.call(marginId);
    expect(contains).to.be.true;
  }

  await expectLogOpenPosition(margin, marginId, tx, response);

  response.id = marginId;
  return response;
}

async function expectLogOpenPosition(margin, marginId, tx, response) {
  expectLog(response.logs[0], 'PositionOpened', {
    marginId: marginId,
    trader: tx.trader,
    lender: tx.loanOffering.payer,
    loanHash: tx.loanOffering.loanHash,
    baseToken: tx.loanOffering.baseToken,
    quoteToken: tx.loanOffering.quoteToken,
    loanFeeRecipient: tx.loanOffering.feeRecipient,
    marginAmount: tx.marginAmount,
    quoteTokenFromSell:
      tx.marginAmount.div(tx.buyOrder.takerTokenAmount).times(tx.buyOrder.makerTokenAmount),
    depositAmount: tx.depositAmount,
    interestRate: tx.loanOffering.rates.interestRate,
    callTimeLimit: tx.loanOffering.callTimeLimit,
    maxDuration: tx.loanOffering.maxDuration,
    interestPeriod: tx.loanOffering.rates.interestPeriod
  });

  const newTrader = await margin.getPositionTrader.call(marginId);
  const newLender = await margin.getPositionLender.call(marginId);
  let logIndex = 0;
  if (tx.loanOffering.owner !== tx.loanOffering.payer) {
    expectLog(response.logs[++logIndex], 'LenderTransferred', {
      marginId: marginId,
      from: tx.loanOffering.payer,
      to: tx.loanOffering.owner
    });
    if (newLender !== tx.loanOffering.owner) {
      expectLog(response.logs[++logIndex], 'LenderTransferred', {
        marginId: marginId,
        from: tx.loanOffering.owner,
        to: newLender
      });
    }
  }
  if (tx.owner !== tx.trader) {
    expectLog(response.logs[++logIndex], 'PositionTransferred', {
      marginId: marginId,
      from: tx.trader,
      to: tx.owner
    });
    if (newTrader !== tx.owner) {
      expectLog(response.logs[++logIndex], 'PositionTransferred', {
        marginId: marginId,
        from: tx.owner,
        to: newTrader
      });
    }
  }
}

async function callIncreasePosition(margin, tx) {
  const marginId = tx.id;

  const addresses = [
    tx.loanOffering.payer,
    tx.loanOffering.signer,
    tx.loanOffering.taker,
    tx.loanOffering.feeRecipient,
    tx.loanOffering.lenderFeeTokenAddress,
    tx.loanOffering.takerFeeTokenAddress,
    tx.exchangeWrapperAddress
  ];

  const values256 = [
    tx.loanOffering.rates.maxAmount,
    tx.loanOffering.rates.minAmount,
    tx.loanOffering.rates.minQuoteToken,
    tx.loanOffering.rates.lenderFee,
    tx.loanOffering.rates.takerFee,
    tx.loanOffering.expirationTimestamp,
    tx.loanOffering.salt,
    tx.marginAmount
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

  let response = await margin.increasePosition(
    marginId,
    addresses,
    values256,
    values32,
    sigV,
    sigRS,
    true,
    order,
    { from: tx.trader }
  );

  await expectIncreasePositionLog(
    margin,
    tx,
    response
  );

  response.id = marginId;
  return response;
}

async function expectIncreasePositionLog(margin, tx, response) {
  const marginId = tx.id;
  const [time1, time2, marginAmount, quoteTokenAmount] = await Promise.all([
    margin.getPositionStartTimestamp.call(marginId),
    getBlockTimestamp(response.receipt.blockNumber),
    margin.getPositionUnclosedAmount.call(marginId),
    margin.getPositionBalance.call(marginId)
  ]);
  const owed = await getOwedAmountForTime(
    new BigNumber(time2).minus(time1),
    tx.loanOffering.rates.interestPeriod,
    tx.loanOffering.rates.interestRate,
    tx.marginAmount,
    false
  );
  const quoteTokenFromSell =
    owed.div(tx.buyOrder.takerTokenAmount).times(tx.buyOrder.makerTokenAmount);
  const minTotalDeposit = quoteTokenAmount.div(marginAmount).times(tx.marginAmount);

  expectLog(response.logs[0], 'PositionIncreased', {
    marginId: marginId,
    trader: tx.trader,
    lender: tx.loanOffering.payer,
    positionOwner: tx.owner,
    loanOwner: tx.loanOffering.owner,
    loanHash: tx.loanOffering.loanHash,
    loanFeeRecipient: tx.loanOffering.feeRecipient,
    amountBorrowed: owed,
    effectiveAmountAdded: tx.marginAmount,
    quoteTokenFromSell: quoteTokenFromSell,
    depositAmount: minTotalDeposit.minus(quoteTokenFromSell)
  });
}

async function issueTokensAndSetAllowancesFor(tx) {
  const [baseToken, quoteToken, feeToken] = await Promise.all([
    BaseToken.deployed(),
    QuoteToken.deployed(),
    FeeToken.deployed()
  ]);

  await Promise.all([
    baseToken.issueTo(
      tx.loanOffering.payer,
      tx.loanOffering.rates.maxAmount
    ),
    quoteToken.issueTo(
      tx.trader,
      tx.depositAmount
    ),
    quoteToken.issueTo(
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
    )
  ]);

  return Promise.all([
    baseToken.approve(
      ProxyContract.address,
      tx.loanOffering.rates.maxAmount,
      { from: tx.loanOffering.payer }
    ),
    quoteToken.approve(
      ProxyContract.address,
      tx.depositAmount,
      { from: tx.trader }
    ),
    quoteToken.approve(
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

async function doOpenPosition(accounts, _salt = DEFAULT_SALT, trader = null) {
  const [OpenPositionTx, margin] = await Promise.all([
    createMarginTradeTx(accounts, _salt),
    Margin.deployed()
  ]);

  await issueTokensAndSetAllowancesFor(OpenPositionTx);

  if (trader) {
    OpenPositionTx.owner = trader;
  }

  const response = await callOpenPosition(margin, OpenPositionTx);

  OpenPositionTx.id = response.id;
  OpenPositionTx.response = response;
  return OpenPositionTx;
}

async function callClosePosition(
  margin,
  OpenPositionTx,
  sellOrder,
  closeAmount,
  from = null,
  recipient = null
) {
  const closer = from || OpenPositionTx.trader;
  recipient = recipient || closer;

  const { startAmount, startQuote, startTimestamp } =
    await getPreCloseVariables(margin, OpenPositionTx.id);

  const tx = await transact(
    margin.closePosition,
    OpenPositionTx.id,
    closeAmount,
    recipient,
    ZeroExExchangeWrapper.address,
    zeroExOrderToBytes(sellOrder),
    { from: closer }
  );

  await expectCloseLog(
    margin,
    {
      OpenPositionTx,
      sellOrder,
      closer,
      recipient,
      startAmount,
      startQuote,
      startTimestamp,
      tx
    }
  );

  return tx;
}

async function callClosePositionDirectly(
  margin,
  OpenPositionTx,
  closeAmount,
  from = null,
  recipient = null
) {
  const closer = from || OpenPositionTx.trader;
  recipient = recipient || closer;

  const { startAmount, startQuote, startTimestamp } =
    await getPreCloseVariables(margin, OpenPositionTx.id);

  const tx = await transact(
    margin.closePositionDirectly,
    OpenPositionTx.id,
    closeAmount,
    recipient,
    { from: closer }
  );

  await expectCloseLog(
    margin,
    {
      OpenPositionTx,
      closer,
      recipient,
      startAmount,
      startQuote,
      startTimestamp,
      tx
    }
  );

  return tx;
}

async function getPreCloseVariables(margin, marginId) {
  const [
    startAmount,
    startQuote,
    startTimestamp
  ] = await Promise.all([
    margin.getPositionUnclosedAmount.call(marginId),
    margin.getPositionBalance.call(marginId),
    margin.getPositionStartTimestamp.call(marginId)
  ]);
  return {
    startAmount,
    startQuote,
    startTimestamp
  }
}

async function expectCloseLog(margin, params) {
  const [
    endAmount,
    endQuote,
    endTimestamp
  ] = await Promise.all([
    margin.getPositionUnclosedAmount.call(params.OpenPositionTx.id),
    margin.getPositionBalance.call(params.OpenPositionTx.id),
    getBlockTimestamp(params.tx.receipt.blockNumber)
  ]);
  const actualCloseAmount = params.startAmount.minus(endAmount);

  const owed = await getOwedAmountForTime(
    new BigNumber(endTimestamp).minus(params.startTimestamp),
    params.OpenPositionTx.loanOffering.rates.interestPeriod,
    params.OpenPositionTx.loanOffering.rates.interestRate,
    actualCloseAmount,
    true
  );
  const buybackCost = params.sellOrder
    ? owed.div(params.sellOrder.makerTokenAmount).times(params.sellOrder.takerTokenAmount)
    : 0;
  const quoteTokenPayout =
    actualCloseAmount.div(params.startAmount).times(params.startQuote).minus(buybackCost);

  expect(endQuote).to.be.bignumber.equal(
    params.startQuote.minus(quoteTokenPayout).minus(buybackCost));

  expectLog(params.tx.logs[0], 'PositionClosed', {
    marginId: params.OpenPositionTx.id,
    closer: params.closer,
    payoutRecipient: params.recipient,
    closeAmount: actualCloseAmount,
    remainingAmount: params.startAmount.minus(actualCloseAmount),
    baseTokenPaidToLender: owed,
    quoteTokenPayout: quoteTokenPayout,
    buybackCost: buybackCost
  });
}

async function callLiquidate(
  margin,
  OpenPositionTx,
  liquidateAmount,
  from,
  payoutRecipient = null
) {
  const startAmount = await margin.getPositionUnclosedAmount.call(OpenPositionTx.id);
  const startQuote = await margin.getPositionBalance.call(OpenPositionTx.id);

  payoutRecipient = payoutRecipient || from
  const tx = await transact(
    margin.liquidatePosition,
    OpenPositionTx.id,
    liquidateAmount,
    payoutRecipient,
    { from: from }
  );

  const actualLiquidateAmount = BigNumber.min(startAmount, liquidateAmount);

  expectLog(tx.logs[0], 'PositionLiquidated', {
    marginId: OpenPositionTx.id,
    liquidator: from,
    payoutRecipient: payoutRecipient,
    liquidatedAmount: actualLiquidateAmount,
    remainingAmount: startAmount.minus(actualLiquidateAmount),
    quoteTokenPayout: actualLiquidateAmount.times(startQuote).div(startAmount)
  });

  return tx;
}

async function callCancelLoanOffer(
  margin,
  loanOffering,
  cancelAmount,
  from = null
) {
  const { addresses, values256, values32 } = formatLoanOffering(loanOffering);

  const canceledAmount1 = await margin.loanCancels.call(loanOffering.loanHash);
  const tx = await margin.cancelLoanOffering(
    addresses,
    values256,
    values32,
    cancelAmount,
    { from: from || loanOffering.payer }
  );
  const canceledAmount2 = await margin.loanCancels.call(loanOffering.loanHash);

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
  margin,
  loanOffering,
  from = null
) {
  const { addresses, values256, values32 } = formatLoanOffering(loanOffering);

  const wasApproved = await margin.isLoanApproved.call(loanOffering.loanHash);

  const tx = await margin.approveLoanOffering(
    addresses,
    values256,
    values32,
    { from: from || loanOffering.payer }
  );

  const approved = await margin.isLoanApproved.call(loanOffering.loanHash);
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
    loanOffering.baseToken,
    loanOffering.quoteToken,
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
    loanOffering.rates.minQuoteToken,
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

async function issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder) {
  const [baseToken, feeToken] = await Promise.all([
    BaseToken.deployed(),
    FeeToken.deployed(),
  ]);

  await Promise.all([
    baseToken.issueTo(
      sellOrder.maker,
      sellOrder.makerTokenAmount
    ),
    feeToken.issueTo(
      OpenPositionTx.trader,
      sellOrder.takerFee
    ),
    feeToken.issueTo(
      sellOrder.maker,
      sellOrder.makerFee
    )
  ]);

  return Promise.all([
    baseToken.approve(
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
      { from: OpenPositionTx.trader }
    )
  ]);
}

async function getPosition(margin, id) {
  const [
    [
      baseToken,
      quoteToken,
      lender,
      trader
    ],
    [
      marginAmount,
      closedAmount,
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
  ] = await margin.getPosition.call(id);

  return {
    baseToken,
    quoteToken,
    marginAmount,
    closedAmount,
    interestRate,
    requiredDeposit,
    callTimeLimit,
    startTimestamp,
    callTimestamp,
    maxDuration,
    interestPeriod,
    lender,
    trader
  };
}

async function doOpenPositionAndCall(
  accounts,
  _salt = DEFAULT_SALT,
  _requiredDeposit = new BigNumber(10)
) {
  const [margin, vault, baseToken] = await Promise.all([
    Margin.deployed(),
    Vault.deployed(),
    BaseToken.deployed()
  ]);

  const OpenPositionTx = await doOpenPosition(accounts, _salt);

  const callTx = await margin.marginCall(
    OpenPositionTx.id,
    _requiredDeposit,
    { from: OpenPositionTx.loanOffering.payer }
  );

  return { margin, vault, baseToken, OpenPositionTx, callTx };
}

async function issueForDirectClose(OpenPositionTx) {
  const baseToken = await BaseToken.deployed();

  // Issue to the margin trader the maximum amount of base token they could have to pay

  const maxInterestFee = await getMaxInterestFee(OpenPositionTx);
  const maxBaseTokenOwed = OpenPositionTx.marginAmount.plus(maxInterestFee);

  await Promise.all([
    baseToken.issueTo(
      OpenPositionTx.trader,
      maxBaseTokenOwed
    ),
    baseToken.approve(
      ProxyContract.address,
      maxBaseTokenOwed,
      { from: OpenPositionTx.trader }
    )
  ]);
}

async function getMaxInterestFee(OpenPositionTx) {
  await TestInterestImpl.link('InterestImpl', InterestImpl.address);
  const interestCalc = await TestInterestImpl.new();

  const interest = await interestCalc.getCompoundedInterest.call(
    OpenPositionTx.marginAmount,
    OpenPositionTx.loanOffering.rates.interestRate,
    OpenPositionTx.loanOffering.maxDuration
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
  createMarginTradeTx,
  issueTokensAndSetAllowancesFor,
  callOpenPosition,
  doOpenPosition,
  issueTokensAndSetAllowancesForClose,
  callCancelLoanOffer,
  callClosePosition,
  callClosePositionDirectly,
  callLiquidate,
  getPosition,
  doOpenPositionAndCall,
  issueForDirectClose,
  callApproveLoanOffering,
  issueTokenToAccountInAmountAndApproveProxy,
  getMaxInterestFee,
  callIncreasePosition
};
