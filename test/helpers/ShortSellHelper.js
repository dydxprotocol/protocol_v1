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
const { createLoanOffering } = require('./LoanHelper');
const { expectLog } = require('./EventHelper');
const { transact } = require('./ContractHelper');

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
    order,
    { from: tx.seller }
  );

  if (safely) {
    contains = await shortSell.containsShort.call(shortId);
    expect(contains).to.be.true;
  }

  expectLog(response.logs[0], 'ShortInitiated', {
    id: shortId,
    shortSeller: tx.seller,
    lender: tx.loanOffering.payer,
    loanHash: tx.loanOffering.loanHash,
    baseToken: tx.loanOffering.baseToken,
    quoteToken: tx.loanOffering.quoteToken,
    loanFeeRecipient: tx.loanOffering.feeRecipient,
    shortAmount: tx.shortAmount,
    quoteTokenFromSell:
      tx.shortAmount.times(tx.buyOrder.makerTokenAmount).div(tx.buyOrder.takerTokenAmount),
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
      id: shortId,
      from: tx.loanOffering.payer,
      to: tx.loanOffering.owner
    });
    if (newLender !== tx.loanOffering.owner) {
      expectLog(response.logs[++logIndex], 'LoanTransferred', {
        id: shortId,
        from: tx.loanOffering.owner,
        to: newLender
      });
    }
  }
  if (tx.owner !== tx.seller) {
    expectLog(response.logs[++logIndex], 'ShortTransferred', {
      id: shortId,
      from: tx.seller,
      to: tx.owner
    });
    if (newSeller !== tx.owner) {
      expectLog(response.logs[++logIndex], 'ShortTransferred', {
        id: shortId,
        from: tx.owner,
        to: newSeller
      });
    }
  }

  response.id = shortId;
  return response;
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
    order,
    { from: tx.seller }
  );

  expectLog(response.logs[0], 'ValueAddedToShort', {
    id: shortId,
    shortSeller: tx.seller,
    lender: tx.loanOffering.payer,
    loanHash: tx.loanOffering.loanHash,
    loanFeeRecipient: tx.loanOffering.feeRecipient,
    amountBorrowed: "unspecified",
    effectiveAmountAdded: tx.shortAmount,
    quoteTokenFromSell: "unspecified",
    depositAmount: "unspecified"
  });

  response.id = shortId;
  return response;
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

  const startAmount = await shortSell.getShortUnclosedAmount.call(shortTx.id);

  const tx = await transact(
    shortSell.closeShort,
    shortTx.id,
    closeAmount,
    recipient,
    ZeroExExchangeWrapper.address,
    zeroExOrderToBytes(sellOrder),
    { from: closer }
  );
  const endAmount = await shortSell.getShortUnclosedAmount.call(shortTx.id);

  const actualCloseAmount = startAmount.minus(endAmount);

  expectLog(tx.logs[0], 'ShortClosed', {
    id: shortTx.id,
    closer: closer,
    payoutRecipient: recipient,
    closeAmount: actualCloseAmount,
    remainingAmount: startAmount.minus(actualCloseAmount),
    baseTokenPaidToLender: "unspecified",
    shortSellerQuoteToken: "unspecified",
    buybackCost: "unspecified"
  });

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

  const startAmount = await shortSell.getShortUnclosedAmount.call(shortTx.id);

  const tx = await transact(
    shortSell.closeShortDirectly,
    shortTx.id,
    closeAmount,
    recipient,
    { from: closer }
  );

  const endAmount = await shortSell.getShortUnclosedAmount.call(shortTx.id);

  const actualCloseAmount = startAmount.minus(endAmount);

  expectLog(tx.logs[0], 'ShortClosed', {
    id: shortTx.id,
    closer: closer,
    payoutRecipient: recipient,
    closeAmount: actualCloseAmount,
    remainingAmount: startAmount.minus(actualCloseAmount),
    baseTokenPaidToLender: "unspecified",
    shortSellerQuoteToken: "unspecified",
    buybackCost: 0
  });

  return tx;
}

async function callLiquidate(shortSell, shortTx, liquidateAmount, from) {
  const startAmount = await shortSell.getShortUnclosedAmount.call(shortTx.id);
  const startQuote = await shortSell.getShortBalance.call(shortTx.id);

  const tx = await transact(
    shortSell.liquidate,
    shortTx.id,
    liquidateAmount,
    { from: from }
  );

  const actualLiquidateAmount = BigNumber.min(startAmount, liquidateAmount);

  expectLog(tx.logs[0], 'LoanLiquidated', {
    id: shortTx.id,
    liquidator: from,
    liquidatedAmount: actualLiquidateAmount,
    remainingAmount: startAmount.minus(actualLiquidateAmount),
    quoteAmount: actualLiquidateAmount.times(startQuote).div(startAmount)
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

  const tx = await shortSell.approveLoanOffering(
    addresses,
    values256,
    values32,
    { from: from || loanOffering.payer }
  );

  const approved = await shortSell.isLoanApproved.call(loanOffering.loanHash);
  expect(approved).to.be.true;

  expectLog(tx.logs[0], 'LoanOfferingApproved', {
    loanHash: loanOffering.loanHash,
    lender: loanOffering.payer,
    feeRecipient: loanOffering.feeRecipient
  });

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
