/*global artifacts, web3*/

const expect = require('chai').expect;
const ZeroEx = require('0x.js').ZeroEx;
const promisify = require("es6-promisify");
const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const ethUtil = require('ethereumjs-util');

const ShortSell = artifacts.require("ShortSell");
const ShortSellRepo = artifacts.require("ShortSellRepo");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const Exchange = artifacts.require("Exchange");
const ProxyContract = artifacts.require("Proxy");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const Vault = artifacts.require("Vault");
const SafetyDepositBox = artifacts.require("SafetyDepositBox");
const { BIGNUMBERS } = require('../helpers/Constants');

const web3Instance = new Web3(web3.currentProvider);

const BASE_AMOUNT = new BigNumber('1e18');
const DEFAULT_SALT = 425;

// PUBLIC

async function createShortSellTx(accounts, _salt = DEFAULT_SALT) {
  const [loanOffering, buyOrder] = await Promise.all([
    createLoanOffering(accounts, _salt),
    createSigned0xBuyOrder(accounts, _salt)
  ]);

  const tx = {
    underlyingToken: UnderlyingToken.address,
    baseToken: BaseToken.address,
    shortAmount: BASE_AMOUNT,
    depositAmount: BASE_AMOUNT.times(new BigNumber(2)),
    loanOffering: loanOffering,
    buyOrder: buyOrder,
    seller: accounts[0]
  };

  return tx;
}

async function createSigned0xSellOrder(accounts, _salt = DEFAULT_SALT) {
  // 4 baseToken : 1 underlyingToken rate
  let order = {
    exchangeContractAddress: Exchange.address,
    expirationUnixTimestampSec: new BigNumber(100000000000000),
    feeRecipient: accounts[6],
    maker: accounts[5],
    makerFee: BASE_AMOUNT.times(new BigNumber(.01)),
    makerTokenAddress: UnderlyingToken.address,
    makerTokenAmount: BASE_AMOUNT.times(new BigNumber(2)),
    salt: new BigNumber(_salt),
    taker: ZeroEx.NULL_ADDRESS,
    takerFee: BASE_AMOUNT.times(new BigNumber(.1)),
    takerTokenAddress: BaseToken.address,
    takerTokenAmount: BASE_AMOUNT.times(new BigNumber(8)),
    takerFeeTokenAddress: FeeToken.address,
    makerFeeTokenAddress: FeeToken.address
  };

  const signature = await signOrder(order);

  order.ecSignature = signature;

  return order;
}

function callShort(shortSell, tx) {
  const addresses = [
    ZeroEx.NULL_ADDRESS,
    tx.loanOffering.underlyingToken,
    tx.loanOffering.baseToken,
    tx.loanOffering.lender,
    tx.loanOffering.signer,
    tx.loanOffering.owner,
    tx.loanOffering.taker,
    tx.loanOffering.feeRecipient,
    tx.loanOffering.lenderFeeTokenAddress,
    tx.loanOffering.takerFeeTokenAddress,
    tx.buyOrder.maker,
    tx.buyOrder.taker,
    tx.buyOrder.feeRecipient,
    tx.buyOrder.makerFeeTokenAddress,
    tx.buyOrder.takerFeeTokenAddress
  ];

  const values256 = [
    tx.loanOffering.rates.minimumDeposit,
    tx.loanOffering.rates.maxAmount,
    tx.loanOffering.rates.minAmount,
    tx.loanOffering.rates.minimumSellAmount,
    tx.loanOffering.rates.dailyInterestFee,
    tx.loanOffering.rates.lenderFee,
    tx.loanOffering.rates.takerFee,
    tx.loanOffering.expirationTimestamp,
    tx.loanOffering.salt,
    tx.buyOrder.makerTokenAmount,
    tx.buyOrder.takerTokenAmount,
    tx.buyOrder.makerFee,
    tx.buyOrder.takerFee,
    tx.buyOrder.expirationUnixTimestampSec,
    tx.buyOrder.salt,
    tx.shortAmount,
    tx.depositAmount
  ];

  const values32 = [
    tx.loanOffering.callTimeLimit,
    tx.loanOffering.maxDuration
  ];

  const sigV = [
    tx.loanOffering.signature.v,
    tx.buyOrder.ecSignature.v
  ];

  const sigRS = [
    tx.loanOffering.signature.r,
    tx.loanOffering.signature.s,
    tx.buyOrder.ecSignature.r,
    tx.buyOrder.ecSignature.s
  ];

  return shortSell.short(
    addresses,
    values256,
    values32,
    sigV,
    sigRS,
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
      ProxyContract.address,
      tx.buyOrder.makerTokenAmount,
      { from: tx.buyOrder.maker }
    ),
    feeToken.approve(
      ProxyContract.address,
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
      tx.loanOffering.rates.takerFee.plus(tx.buyOrder.takerFee),
      { from: tx.seller }
    )
  ]);
}

async function doShort(accounts, _salt = DEFAULT_SALT) {
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

  const response = await callShort(shortSell, shortTx);

  const contains = await shortSell.containsShort.call(shortId);
  expect(contains).to.be.true;

  shortTx.id = shortId;
  shortTx.response = response;
  return shortTx;
}

function callCloseShort(shortSell, shortTx, sellOrder, closeAmount, from) {
  const { addresses, values } = getOrderTxFields(sellOrder);

  return shortSell.closeShort(
    shortTx.id,
    closeAmount,
    addresses,
    values,
    sellOrder.ecSignature.v,
    sellOrder.ecSignature.r,
    sellOrder.ecSignature.s,
    { from: from || shortTx.seller }
  );
}

function getOrderTxFields(order) {
  const addresses = [
    order.maker,
    order.taker,
    order.feeRecipient,
    order.makerFeeTokenAddress,
    order.takerFeeTokenAddress
  ];
  const values = [
    order.makerTokenAmount,
    order.takerTokenAmount,
    order.makerFee,
    order.takerFee,
    order.expirationUnixTimestampSec,
    order.salt
  ];

  return { addresses, values };
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
    loanOffering.expirationTimestamp,
    loanOffering.salt,
  ];

  const values32 = [
    loanOffering.callTimeLimit,
    loanOffering.maxDuration
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
      ProxyContract.address,
      sellOrder.makerTokenAmount,
      { from: sellOrder.maker }
    ),
    feeToken.approve(
      ProxyContract.address,
      sellOrder.makerFee,
      { from: sellOrder.maker }
    ),
    feeToken.approve(
      ProxyContract.address,
      sellOrder.takerFee,
      { from: shortTx.seller }
    )
  ]);
}

async function totalTokensForAddress(tokenContract, address, safe) {
  if (!safe) {
    safe = await SafetyDepositBox.deployed();
  }
  const [
    directBalance,
    balanceInSafe
  ] = await Promise.all([
    tokenContract.balanceOf.call(address),
    safe.withdrawableBalances.call(address, tokenContract.address)
  ]);
  return directBalance.plus(balanceInSafe);
}

// HELPERS

async function createSigned0xBuyOrder(accounts, _salt = DEFAULT_SALT) {
  // 3 baseToken : 1 underlyingToken rate
  let order = {
    exchangeContractAddress: Exchange.address,
    expirationUnixTimestampSec: new BigNumber(100000000000000),
    feeRecipient: accounts[4],
    maker: accounts[2],
    makerFee: BASE_AMOUNT.times(.02),
    makerTokenAddress: BaseToken.address,
    makerTokenAmount: BASE_AMOUNT.times(6),
    salt: new BigNumber(_salt),
    taker: ZeroEx.NULL_ADDRESS,
    takerFee: BASE_AMOUNT.times(.1),
    takerTokenAddress: UnderlyingToken.address,
    takerTokenAmount: BASE_AMOUNT.times(2),
    makerFeeTokenAddress: FeeToken.address,
    takerFeeTokenAddress: FeeToken.address,
  };

  const signature = await signOrder(order);

  order.ecSignature = signature;

  return order;
}

async function createLoanOffering(accounts, _salt = DEFAULT_SALT) {
  let loanOffering = {
    underlyingToken: UnderlyingToken.address,
    baseToken: BaseToken.address,
    lender: accounts[1],
    signer: ZeroEx.NULL_ADDRESS,
    owner: ZeroEx.NULL_ADDRESS,
    taker: ZeroEx.NULL_ADDRESS,
    feeRecipient: accounts[3],
    lenderFeeTokenAddress: FeeToken.address,
    takerFeeTokenAddress: FeeToken.address,
    rates: {
      minimumDeposit:    BASE_AMOUNT,
      maxAmount:         BASE_AMOUNT.times(3),
      minAmount:         BASE_AMOUNT.times(.1),
      minimumSellAmount: BASE_AMOUNT.times(.01),
      dailyInterestFee:  BASE_AMOUNT.times(.01),
      lenderFee:         BASE_AMOUNT.times(.01),
      takerFee:          BASE_AMOUNT.times(.02)
    },
    expirationTimestamp: 1000000000000,
    callTimeLimit: 10000,
    maxDuration: 365 * BIGNUMBERS.ONE_DAY_IN_SECONDS,
    salt: _salt
  };

  loanOffering.signature = await signLoanOffering(loanOffering);

  return loanOffering;
}

async function signLoanOffering(loanOffering) {
  const valuesHash = web3Instance.utils.soliditySha3(
    loanOffering.rates.minimumDeposit,
    loanOffering.rates.maxAmount,
    loanOffering.rates.minAmount,
    loanOffering.rates.minimumSellAmount,
    loanOffering.rates.dailyInterestFee,
    loanOffering.rates.lenderFee,
    loanOffering.rates.takerFee,
    loanOffering.expirationTimestamp,
    { type: 'uint32', value: loanOffering.callTimeLimit },
    { type: 'uint32', value: loanOffering.maxDuration },
    loanOffering.salt
  );
  const hash = web3Instance.utils.soliditySha3(
    ShortSell.address,
    loanOffering.underlyingToken,
    loanOffering.baseToken,
    loanOffering.lender,
    loanOffering.signer,
    loanOffering.owner,
    loanOffering.taker,
    loanOffering.feeRecipient,
    loanOffering.lenderFeeTokenAddress,
    loanOffering.takerFeeTokenAddress,
    valuesHash
  );

  loanOffering.loanHash = hash;

  const signer = loanOffering.signer === ZeroEx.NULL_ADDRESS
    ? loanOffering.lender : loanOffering.signer;

  const signature = await promisify(web3Instance.eth.sign)(
    hash, signer
  );

  const { v, r, s } = ethUtil.fromRpcSig(signature);

  return {
    v,
    r: ethUtil.bufferToHex(r),
    s: ethUtil.bufferToHex(s)
  }
}

async function signOrder(order) {
  const signature = await promisify(web3Instance.eth.sign)(
    getOrderHash(order), order.maker
  );

  const { v, r, s } = ethUtil.fromRpcSig(signature);

  return {
    v,
    r: ethUtil.bufferToHex(r),
    s: ethUtil.bufferToHex(s)
  };
}

async function sign0xOrder(order) {
  const signature = await promisify(web3Instance.eth.sign)(
    get0xOrderHash(order), order.maker
  );

  const { v, r, s } = ethUtil.fromRpcSig(signature);

  return {
    v,
    r: ethUtil.bufferToHex(r),
    s: ethUtil.bufferToHex(s)
  };
}

function getOrderHash(order) {
  return web3Instance.utils.soliditySha3(
    Exchange.address,
    order.maker,
    order.taker,
    order.makerTokenAddress,
    order.takerTokenAddress,
    order.feeRecipient,
    order.makerFeeTokenAddress,
    order.takerFeeTokenAddress,
    order.makerTokenAmount,
    order.takerTokenAmount,
    order.makerFee,
    order.takerFee,
    order.expirationUnixTimestampSec,
    order.salt
  )
}

function get0xOrderHash(order) {
  return web3Instance.utils.soliditySha3(
    ZeroExExchange.address,
    order.maker,
    order.taker,
    order.makerTokenAddress,
    order.takerTokenAddress,
    order.feeRecipient,
    order.makerTokenAmount,
    order.takerTokenAmount,
    order.makerFee,
    order.takerFee,
    order.expirationUnixTimestampSec,
    order.salt
  )
}

async function getShort(shortSell, id) {
  const repo = await ShortSellRepo.deployed();
  const [
    underlyingToken,
    baseToken,
    shortAmount,
    closedAmount,
    interestRate,
    callTimeLimit,
    startTimestamp,
    callTimestamp,
    maxDuration,
    lender,
    seller
  ] = await repo.getShort.call(id);

  return {
    underlyingToken,
    baseToken,
    shortAmount,
    closedAmount,
    interestRate,
    callTimeLimit,
    startTimestamp,
    callTimestamp,
    maxDuration,
    lender,
    seller
  };
}

async function getShortAuctionOffer(shortSell, id) {
  const [
    offer,
    bidder,
    exists
  ] = await shortSell.getShortAuctionOffer.call(id);

  return {
    offer,
    bidder,
    exists
  };
}

async function doShortAndCall(accounts, _salt = DEFAULT_SALT) {
  const [shortSell, vault, safe, underlyingToken] = await Promise.all([
    ShortSell.deployed(),
    Vault.deployed(),
    SafetyDepositBox.deployed(),
    UnderlyingToken.deployed()
  ]);

  const shortTx = await doShort(accounts, _salt);

  await shortSell.callInLoan(
    shortTx.id,
    { from: shortTx.loanOffering.lender }
  );

  return { shortSell, vault, safe, underlyingToken, shortTx };
}

async function placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid) {
  await underlyingToken.issue(
    shortTx.shortAmount,
    { from: bidder }
  );
  await underlyingToken.approve(
    ProxyContract.address,
    shortTx.shortAmount,
    { from: bidder }
  );

  return shortSell.placeSellbackBid(
    shortTx.id,
    bid,
    { from: bidder }
  );
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

function getPartialAmount(
  numerator,
  denominator,
  target
) {
  if (!(numerator instanceof BigNumber)) {
    numerator = new BigNumber(numerator);
  }
  return numerator.times(target).div(denominator).floor();
}

module.exports = {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  createSigned0xSellOrder,
  doShort,
  issueTokensAndSetAllowancesForClose,
  getPartialAmount,
  signLoanOffering,
  callCancelLoanOffer,
  signOrder,
  sign0xOrder,
  callCloseShort,
  getShort,
  getShortAuctionOffer,
  placeAuctionBid,
  doShortAndCall,
  issueForDirectClose,
  totalTokensForAddress,
  callApproveLoanOffering,
  issueTokenToAccountInAmountAndApproveProxy
};
