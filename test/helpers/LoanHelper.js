/*global artifacts, web3*/

const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
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
      minimumDeposit:    BIGNUMBERS.BASE_AMOUNT,
      maxAmount:         BIGNUMBERS.BASE_AMOUNT.times(3),
      minAmount:         BIGNUMBERS.BASE_AMOUNT.times(.1),
      minimumSellAmount: BIGNUMBERS.BASE_AMOUNT.times(.01),
      dailyInterestFee:  BIGNUMBERS.BASE_AMOUNT.times(.01),
      lenderFee:         BIGNUMBERS.BASE_AMOUNT.times(.01),
      takerFee:          BIGNUMBERS.BASE_AMOUNT.times(.02)
    },
    expirationTimestamp: 1000000000000, // 31.69 millennia from 1970
    callTimeLimit: 10000,
    endDate: 365 * BIGNUMBERS.ONE_DAY_IN_SECONDS,
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
    { type: 'uint32', value: loanOffering.endDate },
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

module.exports = {
  createLoanOffering,
  signLoanOffering
}
