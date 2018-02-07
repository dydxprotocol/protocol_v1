/*global artifacts, web3, contract, describe, it, before, beforeEach*/

const expect = require('chai').expect;
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const TokenizedShort = artifacts.require("TokenizedShort");
const TokenizedShortCreator = artifacts.require("TokenizedShortCreator");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const Vault = artifacts.require("Vault");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const ProxyContract = artifacts.require("Proxy");
const { zeroExFeeTokenConstant } = require('../helpers/Constants');
const { doShort } = require('../helpers/ShortSellHelper');
const { transact } = require('../helpers/ContractHelper');

const web3Instance = new Web3(web3.currentProvider);

contract('TokenizedShort', function(accounts) {
  const NAME = "TESTTOKEN";
  const SYMBOL = "XTS";
  const [delay, gracePeriod] = [new BigNumber('123456'), new BigNumber('1234567')];
  const [updateDelay, updateExpiration] = [new BigNumber('112233'), new BigNumber('332211')];
  let shortSellContract, proxyContract, tokenizedShortCreatorContract;
  let shortTx;
  let tokenizedShortContract;
  const INITIAL_TOKEN_HOLDER = accounts[9];

  before('create a short', async () => {
    proxyContract = await ProxyContract.new(delay, gracePeriod);
    shortSellContract = await ShortSell.deployed();
    shortTx = await doShort(accounts);
    tokenizedShortCreatorContract = await TokenizedShortCreator.new(
      shortSellContract.address,
      proxyContract.address,
      updateDelay,
      updateExpiration);
    await proxyContract.grantAccess(tokenizedShortCreatorContract.address);
  });

  beforeEach('set up TokenizedShortCreator contract', async () => {
    // Get the return value of the tokenizeShort function by first using call()
    const tokenCreator = accounts[8];
    const tokenAddress = await transact(tokenizedShortCreatorContract.tokenizeShort,
        INITIAL_TOKEN_HOLDER, shortTx.id, NAME, SYMBOL, { from: tokenCreator });
  });

  describe('Constructor', () => {
    it('sets constrants correctly', async () => {
      const tokenizedShortContract = await TokenizedShort.new(
        shortSellContract.address,
        proxyContract.address,
        initialTokenHolder,
        shortId,
        NAME,
        SYMBOL);
      const [
        shortSellContractAddress,
        proxyContractAddress,
        shortId,
        state,
        name,
        symbol,
        initialTokenHolder,
        redeemed,
        baseToken
      ] = await Promise.all([
        tokenizedShortContract.SHORT_SELL.call(),
        tokenizedShortContract.PROXY.call(),
        tokenizedShortContract.shortId.call(),
        tokenizedShortContract.state.call(),
        tokenizedShortContract.name.call(),
        tokenizedShortContract.symbol.call(),
        tokenizedShortContract.initialTokenHolder.call(),
        tokenizedShortContract.redeemed.call(),
        tokenizedShortContract.baseToken.call()
      ]);
    })
  });

  describe('#initialize', () => {
    beforeEach();

    it('succeeds for an arbitrary caller and sets constants correctly', async () => {

    });

    it('fails if short is not legitimate', async () => {

    });

    it('fails if short has already been closed', async () => {

    });

    it('fails if short seller is not assigned to be the token', async () => {

    });

    it('fails if already initialized', async () => {

    });

    it('fails if already closed', async () => {

    });
  });

  describe('#redeemDirectly', () => {
    beforeEach();

    it('fails if not initialized', async () => {

    });

    it('fails if closed', async () => {

    });

    it('fails if value is zero', async () => {

    });

    it('fails if value is too high', async () => {

    });

    it('fails if user does not have the amount of underlyingToken required', async () => {

    });

    it('succeeds in closing in increments', async () => {

    });
  });

  describe('#redeem', () => {
    beforeEach();

    it('fails if not initialized', async () => {

    });

    it('fails if closed', async () => {

    });

    it('fails if value is zero', async () => {

    });

    it('fails if value is too high', async () => {

    });

    it('fails if 0x order is invalid for any reason', async () => {

    });

    it('succeeds in closing in increments', async () => {

    });
  });

  describe('#claimPayout', () => {
    beforeEach();

    it('fails for zero balance', async () => {

    });

    it('fails for unclosed short', async () => {

    });

    it('succeeds otherwise', async () => {

    });
  });

  describe('#decimals', () => {
    beforeEach();

    it('fails for invalid shortId', async () => {

    });

    it('successfully returns decimal value of underlyingToken', async () => {

    });
  });
});
