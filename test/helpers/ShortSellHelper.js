/*global artifacts, web3*/

const expect = require('chai').expect;
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const ProxyContract = artifacts.require("Proxy");
const Vault = artifacts.require("Vault");
const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const { ADDRESSES, BIGNUMBERS, DEFAULT_SALT } = require('./Constants');
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
    owner: ADDRESSES.ZERO,
    underlyingToken: UnderlyingToken.address,
    baseToken: BaseToken.address,
    shortAmount: BIGNUMBERS.BASE_AMOUNT,
    depositAmount: BIGNUMBERS.BASE_AMOUNT.times(new BigNumber(2)),
    loanOffering: loanOffering,
    buyOrder: buyOrder,
    seller: accounts[0],
    exchangeWrapperAddress: ZeroExExchangeWrapper.address
  };

  return tx;
}

function callShort(shortSell, tx) {
  const addresses = [
    tx.owner,
    tx.loanOffering.underlyingToken,
    tx.loanOffering.baseToken,
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
    tx.loanOffering.rates.minimumDeposit,
    tx.loanOffering.rates.maxAmount,
    tx.loanOffering.rates.minAmount,
    tx.loanOffering.rates.minimumSellAmount,
    tx.loanOffering.rates.dailyInterestFee,
    tx.loanOffering.rates.lenderFee,
    tx.loanOffering.rates.takerFee,
    tx.loanOffering.offerExpiration,
    tx.loanOffering.salt,
    tx.shortAmount,
    tx.depositAmount
  ];

  const values32 = [
    tx.loanOffering.callTimeLimit,
    tx.loanOffering.expirationTimestamp
  ];

  const sigV = tx.loanOffering.signature.v;

  const sigRS = [
    tx.loanOffering.signature.r,
    tx.loanOffering.signature.s,
  ];

  const order = zeroExOrderToBytes(tx.buyOrder);

  return shortSell.short(
    addresses,
    values256,
    values32,
    sigV,
    sigRS,
    order,
    { from: tx.seller }
  );
}

async function issueTokensAndSetAllowancesForShort(tx) {
  const [underlyingToken, baseToken, feeToken] = await Promise.all([
    UnderlyingToken.deployed(),
    BaseToken.deployed(),
    FeeToken.deployed()
  ]);

  await Promise.all([
    underlyingToken.issueTo(
      tx.loanOffering.lender,
      tx.loanOffering.rates.maxAmount
    ),
    baseToken.issueTo(
      tx.seller,
      tx.depositAmount
    ),
    baseToken.issueTo(
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
    underlyingToken.approve(
      ProxyContract.address,
      tx.loanOffering.rates.maxAmount,
      { from: tx.loanOffering.lender }
    ),
    baseToken.approve(
      ProxyContract.address,
      tx.depositAmount,
      { from: tx.seller }
    ),
    baseToken.approve(
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

async function doShort(accounts, _salt = DEFAULT_SALT, tokenized = false) {
  const [shortTx, shortSell] = await Promise.all([
    createShortSellTx(accounts, _salt),
    ShortSell.deployed()
  ]);
  const shortId = web3Instance.utils.soliditySha3(
    shortTx.loanOffering.loanHash,
    0
  );

  const alreadyExists = await shortSell.containsShort.call(shortId);

  expect(alreadyExists).to.be.false;

  await issueTokensAndSetAllowancesForShort(shortTx);

  if (tokenized) {
    shortTx.owner = ERC20ShortCreator.address;
  }
  const response = await callShort(shortSell, shortTx);

  const contains = await shortSell.containsShort.call(shortId);
  expect(contains).to.be.true;

  shortTx.id = shortId;
  shortTx.response = response;
  return shortTx;
}

function callCloseShort(shortSell, shortTx, sellOrder, closeAmount, from) {
  return shortSell.closeShort(
    shortTx.id,
    closeAmount,
    ZeroExExchangeWrapper.address,
    zeroExOrderToBytes(sellOrder),
    { from: from || shortTx.seller }
  );
}

function callCloseShortDirectly(shortSell, shortTx, closeAmount, from) {
  return shortSell.closeShortDirectly(
    shortTx.id,
    closeAmount,
    { from: from || shortTx.seller }
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
    loanOffering.underlyingToken,
    loanOffering.baseToken,
    loanOffering.lender,
    loanOffering.signer,
    loanOffering.owner,
    loanOffering.taker,
    loanOffering.feeRecipient,
    FeeToken.address,
    FeeToken.address
  ];

  const values256 = [
    loanOffering.rates.minimumDeposit,
    loanOffering.rates.maxAmount,
    loanOffering.rates.minAmount,
    loanOffering.rates.minimumSellAmount,
    loanOffering.rates.dailyInterestFee,
    loanOffering.rates.lenderFee,
    loanOffering.rates.takerFee,
    loanOffering.offerExpiration,
    loanOffering.salt,
  ];

  const values32 = [
    loanOffering.callTimeLimit,
    loanOffering.expirationTimestamp
  ];

  return { addresses, values256, values32 };
}

async function issueTokensAndSetAllowancesForClose(shortTx, sellOrder) {
  const [underlyingToken, feeToken] = await Promise.all([
    UnderlyingToken.deployed(),
    FeeToken.deployed(),
  ]);

  await Promise.all([
    underlyingToken.issueTo(
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
    underlyingToken.approve(
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
    underlyingToken,
    baseToken,
    shortAmount,
    closedAmount,
    interestRate,
    requiredDeposit,
    callTimeLimit,
    startTimestamp,
    callTimestamp,
    expirationTimestamp,
    lender,
    seller
  ] = await shortSell.getShort.call(id);

  return {
    underlyingToken,
    baseToken,
    shortAmount,
    closedAmount,
    interestRate,
    requiredDeposit,
    callTimeLimit,
    startTimestamp,
    callTimestamp,
    expirationTimestamp,
    lender,
    seller
  };
}

async function doShortAndCall(
  accounts,
  _salt = DEFAULT_SALT,
  _requiredDeposit = new BigNumber(10)
) {
  const [shortSell, vault, underlyingToken] = await Promise.all([
    ShortSell.deployed(),
    Vault.deployed(),
    UnderlyingToken.deployed()
  ]);

  const shortTx = await doShort(accounts, _salt);

  const callTx = await shortSell.callInLoan(
    shortTx.id,
    _requiredDeposit,
    { from: shortTx.loanOffering.lender }
  );

  return { shortSell, vault, underlyingToken, shortTx, callTx };
}

async function issueForDirectClose(shortTx) {
  const underlyingToken = await UnderlyingToken.deployed();
  await Promise.all([
    underlyingToken.issueTo(
      shortTx.seller,
      shortTx.shortAmount
    ),
    underlyingToken.approve(
      ProxyContract.address,
      shortTx.shortAmount,
      { from: shortTx.seller }
    )
  ]);
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
  callCloseShortDirectly
};
