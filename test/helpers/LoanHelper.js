/*global artifacts, web3*/

const BigNumber = require('bignumber.js');
const QuoteToken = artifacts.require("TokenA");
const BaseToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ZeroEx = require('0x.js').ZeroEx;
const { BIGNUMBERS, DEFAULT_SALT } = require('./Constants');
const Web3 = require('web3');
const ShortSell = artifacts.require("ShortSell");
const promisify = require("es6-promisify");
const ethUtil = require('ethereumjs-util');

const web3Instance = new Web3(web3.currentProvider);

async function createLoanOffering(accounts, _salt = DEFAULT_SALT) {
  let loanOffering = {
    baseToken: BaseToken.address,
    quoteToken: QuoteToken.address,
    lender: accounts[1],
    signer: accounts[1],
    owner: accounts[1],
    taker: ZeroEx.NULL_ADDRESS,
    feeRecipient: accounts[3],
    lenderFeeTokenAddress: FeeToken.address,
    takerFeeTokenAddress: FeeToken.address,
    rates: {
      maxAmount:          BIGNUMBERS.BASE_AMOUNT.times(3),
      minAmount:          BIGNUMBERS.BASE_AMOUNT.times(.1),
      minQuoteToken:      BIGNUMBERS.BASE_AMOUNT.times(1.01),
      interestRate:       new BigNumber('365e16'), // 3.65% nominal per year
      lenderFee:          BIGNUMBERS.BASE_AMOUNT.times(.01),
      takerFee:           BIGNUMBERS.BASE_AMOUNT.times(.02),
      interestPeriod:     BIGNUMBERS.ONE_DAY_IN_SECONDS
    },
    expirationTimestamp:  1000000000000, // 31.69 millennia from 1970
    callTimeLimit: 10000,
    maxDuration: 365 * BIGNUMBERS.ONE_DAY_IN_SECONDS,
    salt: _salt
  };

  loanOffering.signature = await signLoanOffering(loanOffering);

  return loanOffering;
}

async function signLoanOffering(loanOffering) {
  const valuesHash = web3Instance.utils.soliditySha3(
    loanOffering.rates.maxAmount,
    loanOffering.rates.minAmount,
    loanOffering.rates.minQuoteToken,
    loanOffering.rates.interestRate,
    loanOffering.rates.lenderFee,
    loanOffering.rates.takerFee,
    { type: 'uint32', value: loanOffering.rates.interestPeriod },
    loanOffering.expirationTimestamp,
    { type: 'uint32', value: loanOffering.callTimeLimit },
    { type: 'uint32', value: loanOffering.maxDuration },
    loanOffering.salt
  );
  const hash = web3Instance.utils.soliditySha3(
    ShortSell.address,
    loanOffering.baseToken,
    loanOffering.quoteToken,
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

module.exports = {
  createLoanOffering,
  signLoanOffering
}
