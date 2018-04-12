/*global artifacts, web3*/

const expect = require('chai').expect;
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
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

async function createShortSellTx(accounts, _salt = DEFAULT_SALT) {
  const [loanOffering, buyOrder] = await Promise.all([
    createLoanOffering(accounts, _salt),
    createSignedBuyOrder(accounts, _salt)
  ]);

  const tx = {
    owner: accounts[0],
    baseToken: BaseToken.address,
    quoteToken: QuoteToken.address,
    shortAmount: BIGNUMBERS.BASE_AMOUNT,
    depositAmount: BIGNUMBERS.BASE_AMOUNT.times(new BigNumber(2)),
    loanOffering: loanOffering,
    buyOrder: buyOrder,
    seller: accounts[0],
    exchangeWrapperAddress: ZeroExExchangeWrapper.address
  };

  return tx;
}

async function callShort(shortSell, tx, safely = true) {
  const shortId = web3Instance.utils.soliditySha3(
    tx.loanOffering.loanHash,
    0
  );

  let contains = await shortSell.containsShort.call(shortId);
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
    tx.shortAmount,
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

  let response = await shortSell.short(
    addresses,
    values256,
    values32,
    sigV,
    sigRS,
    true,
    order,
    { from: tx.seller }
  );

  if (safely) {
    contains = await shortSell.containsShort.call(shortId);
    expect(contains).to.be.true;
  }

  await expectLogShort(shortSell, shortId, tx, response);

  response.id = shortId;
  return response;
}

async function expectLogShort(shortSell, shortId, tx, response) {
  expectLog(response.logs[0], 'ShortInitiated', {
    shortId: shortId,
    shortSeller: tx.seller,
    lender: tx.loanOffering.payer,
    loanHash: tx.loanOffering.loanHash,
    baseToken: tx.loanOffering.baseToken,
    quoteToken: tx.loanOffering.quoteToken,
    loanFeeRecipient: tx.loanOffering.feeRecipient,
    shortAmount: tx.shortAmount,
    quoteTokenFromSell:
      tx.shortAmount.div(tx.buyOrder.takerTokenAmount).times(tx.buyOrder.makerTokenAmount),
    depositAmount: tx.depositAmount,
    interestRate: tx.loanOffering.rates.interestRate,
    callTimeLimit: tx.loanOffering.callTimeLimit,
    maxDuration: tx.loanOffering.maxDuration,
    interestPeriod: tx.loanOffering.rates.interestPeriod
  });

  const newSeller = await shortSell.getShortSeller.call(shortId);
  const newLender = await shortSell.getShortLender.call(shortId);
  let logIndex = 0;
  if (tx.loanOffering.owner !== tx.loanOffering.payer) {
    expectLog(response.logs[++logIndex], 'LoanTransferred', {
      shortId: shortId,
      from: tx.loanOffering.payer,
      to: tx.loanOffering.owner
    });
    if (newLender !== tx.loanOffering.owner) {
      expectLog(response.logs[++logIndex], 'LoanTransferred', {
        shortId: shortId,
        from: tx.loanOffering.owner,
        to: newLender
      });
    }
  }
  if (tx.owner !== tx.seller) {
    expectLog(response.logs[++logIndex], 'ShortTransferred', {
      shortId: shortId,
      from: tx.seller,
      to: tx.owner
    });
    if (newSeller !== tx.owner) {
      expectLog(response.logs[++logIndex], 'ShortTransferred', {
        shortId: shortId,
        from: tx.owner,
        to: newSeller
      });
    }
  }
}

async function callAddValueToShort(shortSell, tx) {
  const shortId = tx.id;

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
    tx.shortAmount
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

  let response = await shortSell.addValueToShort(
    shortId,
    addresses,
    values256,
    values32,
    sigV,
    sigRS,
    true,
    order,
    { from: tx.seller }
  );

  await expectAddValueToShortLog(
    shortSell,
    tx,
    response
  );

  response.id = shortId;
  return response;
}

async function expectAddValueToShortLog(shortSell, tx, response) {
  const shortId = tx.id;
  const [time1, time2, shortAmount, quoteTokenAmount] = await Promise.all([
    shortSell.getShortStartTimestamp.call(shortId),
    getBlockTimestamp(response.receipt.blockNumber),
    shortSell.getShortUnclosedAmount.call(shortId),
    shortSell.getShortBalance.call(shortId)
  ]);
  const owed = await getOwedAmountForTime(
    new BigNumber(time2).minus(time1),
    tx.loanOffering.rates.interestPeriod,
    tx.loanOffering.rates.interestRate,
    tx.shortAmount,
    false
  );
  const quoteTokenFromSell =
    owed.div(tx.buyOrder.takerTokenAmount).times(tx.buyOrder.makerTokenAmount);
  const minTotalDeposit = quoteTokenAmount.div(shortAmount).times(tx.shortAmount);

  expectLog(response.logs[0], 'ValueAddedToShort', {
    shortId: shortId,
    shortSeller: tx.seller,
    lender: tx.loanOffering.payer,
    shortOwner: tx.owner,
    loanOwner: tx.loanOffering.owner,
    loanHash: tx.loanOffering.loanHash,
    loanFeeRecipient: tx.loanOffering.feeRecipient,
    amountBorrowed: owed,
    effectiveAmountAdded: tx.shortAmount,
    quoteTokenFromSell: quoteTokenFromSell,
    depositAmount: minTotalDeposit.minus(quoteTokenFromSell)
  });
}

async function issueTokensAndSetAllowancesForShort(tx) {
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
      tx.seller,
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
      tx.seller,
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
      { from: tx.seller }
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
      { from: tx.seller }
    ),
    feeToken.approve(
      ZeroExExchangeWrapper.address,
      tx.buyOrder.takerFee,
      { from: tx.seller }
    )
  ]);
}

async function doShort(accounts, _salt = DEFAULT_SALT, shortOwner) {
  const [shortTx, shortSell] = await Promise.all([
    createShortSellTx(accounts, _salt),
    ShortSell.deployed()
  ]);

  await issueTokensAndSetAllowancesForShort(shortTx);

  if (shortOwner) {
    shortTx.owner = shortOwner;
  }

  const response = await callShort(shortSell, shortTx);

  shortTx.id = response.id;
  shortTx.response = response;
  return shortTx;
}

async function callCloseShort(
  shortSell,
  shortTx,
  sellOrder,
  closeAmount,
  from = null,
  recipient = null
) {
  const closer = from || shortTx.seller;
  recipient = recipient || closer;

  const { startAmount, startQuote, startTimestamp } =
    await getPreCloseVariables(shortSell, shortTx.id);

  const tx = await transact(
    shortSell.closeShort,
    shortTx.id,
    closeAmount,
    recipient,
    ZeroExExchangeWrapper.address,
    true,
    zeroExOrderToBytes(sellOrder),
    { from: closer }
  );

  await expectCloseLog(
    shortSell,
    {
      shortTx,
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

async function callCloseShortDirectly(
  shortSell,
  shortTx,
  closeAmount,
  from = null,
  recipient = null
) {
  const closer = from || shortTx.seller;
  recipient = recipient || closer;

  const { startAmount, startQuote, startTimestamp } =
    await getPreCloseVariables(shortSell, shortTx.id);

  const tx = await transact(
    shortSell.closeShortDirectly,
    shortTx.id,
    closeAmount,
    recipient,
    { from: closer }
  );

  await expectCloseLog(
    shortSell,
    {
      shortTx,
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

async function getPreCloseVariables(shortSell, shortId) {
  const [
    startAmount,
    startQuote,
    startTimestamp
  ] = await Promise.all([
    shortSell.getShortUnclosedAmount.call(shortId),
    shortSell.getShortBalance.call(shortId),
    shortSell.getShortStartTimestamp.call(shortId)
  ]);
  return {
    startAmount,
    startQuote,
    startTimestamp
  }
}

async function expectCloseLog(shortSell, params) {
  const [
    endAmount,
    endQuote,
    endTimestamp
  ] = await Promise.all([
    shortSell.getShortUnclosedAmount.call(params.shortTx.id),
    shortSell.getShortBalance.call(params.shortTx.id),
    getBlockTimestamp(params.tx.receipt.blockNumber)
  ]);
  const actualCloseAmount = params.startAmount.minus(endAmount);

  const owed = await getOwedAmountForTime(
    new BigNumber(endTimestamp).minus(params.startTimestamp),
    params.shortTx.loanOffering.rates.interestPeriod,
    params.shortTx.loanOffering.rates.interestRate,
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

  expectLog(params.tx.logs[0], 'ShortClosed', {
    shortId: params.shortTx.id,
    closer: params.closer,
    payoutRecipient: params.recipient,
    closeAmount: actualCloseAmount,
    remainingAmount: params.startAmount.minus(actualCloseAmount),
    baseTokenPaidToLender: owed,
    payoutAmount: quoteTokenPayout,
    buybackCost: buybackCost,
    payoutInQuoteToken: true
  });
}

async function callLiquidate(
  shortSell,
  shortTx,
  liquidateAmount,
  from,
  payoutRecipient = null
) {
  const startAmount = await shortSell.getShortUnclosedAmount.call(shortTx.id);
  const startQuote = await shortSell.getShortBalance.call(shortTx.id);

  payoutRecipient = payoutRecipient || from
  const tx = await transact(
    shortSell.liquidate,
    shortTx.id,
    liquidateAmount,
    payoutRecipient,
    { from: from }
  );

  const actualLiquidateAmount = BigNumber.min(startAmount, liquidateAmount);

  expectLog(tx.logs[0], 'LoanLiquidated', {
    shortId: shortTx.id,
    liquidator: from,
    payoutRecipient: payoutRecipient,
    liquidatedAmount: actualLiquidateAmount,
    remainingAmount: startAmount.minus(actualLiquidateAmount),
    quoteTokenPayout: actualLiquidateAmount.times(startQuote).div(startAmount)
  });

  return tx;
}

async function callCancelLoanOffer(
  shortSell,
  loanOffering,
  cancelAmount,
  from = null
) {
  const { addresses, values256, values32 } = formatLoanOffering(loanOffering);

  const canceledAmount1 = await shortSell.loanCancels.call(loanOffering.loanHash);
  const tx = await shortSell.cancelLoanOffering(
    addresses,
    values256,
    values32,
    cancelAmount,
    { from: from || loanOffering.payer }
  );
  const canceledAmount2 = await shortSell.loanCancels.call(loanOffering.loanHash);

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
  shortSell,
  loanOffering,
  from = null
) {
  const { addresses, values256, values32 } = formatLoanOffering(loanOffering);

  const wasApproved = await shortSell.isLoanApproved.call(loanOffering.loanHash);

  const tx = await shortSell.approveLoanOffering(
    addresses,
    values256,
    values32,
    { from: from || loanOffering.payer }
  );

  const approved = await shortSell.isLoanApproved.call(loanOffering.loanHash);
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

async function issueTokensAndSetAllowancesForClose(shortTx, sellOrder) {
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
      shortTx.seller,
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
      { from: shortTx.seller }
    )
  ]);
}

async function getShort(shortSell, id) {
  const [
    [
      baseToken,
      quoteToken,
      lender,
      seller
    ],
    [
      shortAmount,
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
  ] = await shortSell.getShort.call(id);

  return {
    baseToken,
    quoteToken,
    shortAmount,
    closedAmount,
    interestRate,
    requiredDeposit,
    callTimeLimit,
    startTimestamp,
    callTimestamp,
    maxDuration,
    interestPeriod,
    lender,
    seller
  };
}

async function doShortAndCall(
  accounts,
  _salt = DEFAULT_SALT,
  _requiredDeposit = new BigNumber(10)
) {
  const [shortSell, vault, baseToken] = await Promise.all([
    ShortSell.deployed(),
    Vault.deployed(),
    BaseToken.deployed()
  ]);

  const shortTx = await doShort(accounts, _salt);

  const callTx = await shortSell.callInLoan(
    shortTx.id,
    _requiredDeposit,
    { from: shortTx.loanOffering.payer }
  );

  return { shortSell, vault, baseToken, shortTx, callTx };
}

async function issueForDirectClose(shortTx) {
  const baseToken = await BaseToken.deployed();

  // Issue to the short seller the maximum amount of base token they could have to pay

  const maxInterestFee = await getMaxInterestFee(shortTx);
  const maxBaseTokenOwed = shortTx.shortAmount.plus(maxInterestFee);

  await Promise.all([
    baseToken.issueTo(
      shortTx.seller,
      maxBaseTokenOwed
    ),
    baseToken.approve(
      ProxyContract.address,
      maxBaseTokenOwed,
      { from: shortTx.seller }
    )
  ]);
}

async function getMaxInterestFee(shortTx) {
  await TestInterestImpl.link('InterestImpl', InterestImpl.address);
  const interestCalc = await TestInterestImpl.new();

  const interest = await interestCalc.getCompoundedInterest.call(
    shortTx.shortAmount,
    shortTx.loanOffering.rates.interestRate,
    shortTx.loanOffering.maxDuration
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
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  doShort,
  issueTokensAndSetAllowancesForClose,
  callCancelLoanOffer,
  callCloseShort,
  callCloseShortDirectly,
  callLiquidate,
  getShort,
  doShortAndCall,
  issueForDirectClose,
  callApproveLoanOffering,
  issueTokenToAccountInAmountAndApproveProxy,
  getMaxInterestFee,
  callAddValueToShort
};
