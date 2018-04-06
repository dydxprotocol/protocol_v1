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
    tx.loanOffering.lender,
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

  response.id = shortId;
  return response;
}

async function callAddValueToShort(shortSell, tx) {
  const shortId = tx.id;

  const addresses = [
    tx.loanOffering.lender,
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
      tx.loanOffering.lender,
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
      tx.loanOffering.lender,
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
      { from: tx.loanOffering.lender }
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
      { from: tx.loanOffering.lender }
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

function callCloseShort(shortSell, shortTx, sellOrder, closeAmount, from) {
  const closer = from || shortTx.seller;
  return shortSell.closeShort(
    shortTx.id,
    closeAmount,
    closer,
    ZeroExExchangeWrapper.address,
    zeroExOrderToBytes(sellOrder),
    { from: closer }
  );
}

function callCloseShortDirectly(shortSell, shortTx, closeAmount, from) {
  const closer = from || shortTx.seller;
  return shortSell.closeShortDirectly(
    shortTx.id,
    closeAmount,
    closer,
    { from: closer }
  );
}

function callCancelLoanOffer(shortSell, loanOffering, cancelAmount, from) {
  const { addresses, values256, values32 } = formatLoanOffering(loanOffering);

  return shortSell.cancelLoanOffering(
    addresses,
    values256,
    values32,
    cancelAmount,
    { from: from || loanOffering.lender }
  );
}

function callApproveLoanOffering(shortSell, loanOffering, from) {
  const { addresses, values256, values32 } = formatLoanOffering(loanOffering);

  return shortSell.approveLoanOffering(
    addresses,
    values256,
    values32,
    { from: from || loanOffering.lender }
  );
}

function formatLoanOffering(loanOffering) {
  const addresses = [
    loanOffering.baseToken,
    loanOffering.quoteToken,
    loanOffering.lender,
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
    { from: shortTx.loanOffering.lender }
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
  getShort,
  doShortAndCall,
  issueForDirectClose,
  callApproveLoanOffering,
  issueTokenToAccountInAmountAndApproveProxy,
  callCloseShortDirectly,
  getMaxInterestFee,
  callAddValueToShort
};
