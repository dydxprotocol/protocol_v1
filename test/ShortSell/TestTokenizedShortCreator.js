/*global artifacts, contract, describe, it, before, beforeEach, web3*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const TokenizedShortCreator = artifacts.require("TokenizedShortCreator");
const TokenizedShort = artifacts.require("TokenizedShort");
const ShortSell = artifacts.require("ShortSell");
const ProxyContract = artifacts.require("Proxy");

const { wait } = require('@digix/tempo')(web3);
const { zeroAddr, BIGNUMBERS } = require('../helpers/Constants');
const { validateDelayedUpdateConstants } = require('../helpers/DelayedUpdateHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { doShort } = require('../helpers/ShortSellHelper');

contract('TokenizedShortCreator', function(accounts) {
  const [delay, gracePeriod] = [new BigNumber('123456'), new BigNumber('1234567')];
  const [updateDelay, updateExpiration] = [new BigNumber('112233'), new BigNumber('332211')];
  let shortSellContract, proxyContract, tokenizedShortCreatorContract;
  let shortTx;

  before('create a short', async () => {
    shortSellContract = await ShortSell.deployed();
    shortTx = await doShort(accounts);
  });

  beforeEach('set up TokenizedShortCreator contract', async () => {
    proxyContract = await ProxyContract.new(delay, gracePeriod);
    tokenizedShortCreatorContract = await TokenizedShortCreator.new(
      shortSellContract.address,
      proxyContract.address,
      updateDelay,
      updateExpiration);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      validateDelayedUpdateConstants(tokenizedShortCreatorContract, updateDelay, updateExpiration);
      const [shortSellContractAddress, proxyContractAddress] = await Promise.all([
        tokenizedShortCreatorContract.SHORT_SELL.call(),
        tokenizedShortCreatorContract.PROXY.call()
      ]);
      expect(shortSellContractAddress).to.equal(shortSellContract.address);
      expect(proxyContractAddress).to.equal(proxyContract.address);
    });
  });

  describe('#updateShortSell', () => {
    const newAddress = accounts[7];

    it('allows owner to update the SHORT_SELL field after a delay', async () => {
      await tokenizedShortCreatorContract.updateShortSell(newAddress);

      // Expect SHORT_SELL not to have changed
      let shortSellAddress = await tokenizedShortCreatorContract.SHORT_SELL.call();
      expect(shortSellAddress.toLowerCase()).to.eq(shortSellContract.address.toLowerCase());

      // Should not be able to update it without waiting
      await expectThrow(() => tokenizedShortCreatorContract.updateShortSell(newAddress));

      await wait(updateDelay.toNumber());
      await tokenizedShortCreatorContract.updateShortSell(newAddress);

      // Now it should have changed
      shortSellAddress = await tokenizedShortCreatorContract.SHORT_SELL.call();
      expect(shortSellAddress.toLowerCase()).to.eq(newAddress.toLowerCase());
    });

    it('fails for non-owner accounts', async () => {
      await expectThrow(() => tokenizedShortCreatorContract.updateShortSell(
        newAddress, { from: accounts[2] }));
    });
  });

  describe('#updateProxy', () => {
    const newAddress = accounts[7];
    console.log(accounts);

    it('allows owner to update the PROXY field after a delay', async () => {
      await tokenizedShortCreatorContract.updateProxy(newAddress);

      // Expect PROXY not to have changed
      let proxyAddress = await tokenizedShortCreatorContract.PROXY.call();
      expect(proxyAddress.toLowerCase()).to.eq(proxyContract.address.toLowerCase());

      // Should not be able to update it without waiting
      await expectThrow(() => tokenizedShortCreatorContract.updateProxy(newAddress));

      await wait(updateDelay.toNumber());
      await tokenizedShortCreatorContract.updateProxy(newAddress);

      // Now it should have changed
      proxyAddress = await tokenizedShortCreatorContract.PROXY.call();
      expect(proxyAddress.toLowerCase()).to.eq(newAddress.toLowerCase());
    });

    it('fails for non-owner accounts', async () => {
      await expectThrow(() => tokenizedShortCreatorContract.updateProxy(
        newAddress, { from: accounts[2] }));
    });
  });

  describe('#tokenizeShort', () => {
    const name = "Name";
    const symbol = "NAM";
    const initialTokenHolder = accounts[9];
    const transactionSender = accounts[8];

    it('succeeds for arbitrary caller', async () => {
      await proxyContract.grantAccess(tokenizedShortCreatorContract.address);

      // Get the return value of the tokenizeShort function by first using call()
      const tokenAddress =
        await tokenizedShortCreatorContract.tokenizeShort.call(
          initialTokenHolder, shortTx.id, name, symbol, { from: transactionSender });
      await tokenizedShortCreatorContract.tokenizeShort(
        initialTokenHolder, shortTx.id, name, symbol, { from: transactionSender });

      // Get the TokenizedShort on the blockchain and make sure that it was created correctly
      const shortTokenContract = await TokenizedShort.at(tokenAddress);
      const [
        tokenShortSell,
        tokenProxy,
        tokenShortId,
        tokenState,
        tokenName,
        tokenSymbol,
        tokenHolder,
        tokenRedeemed,
        tokenBaseToken,
        authorized
      ] = await Promise.all([
        shortTokenContract.SHORT_SELL.call(),
        shortTokenContract.PROXY.call(),
        shortTokenContract.shortId.call(),
        shortTokenContract.state.call(),
        shortTokenContract.name.call(),
        shortTokenContract.symbol.call(),
        shortTokenContract.initialTokenHolder.call(),
        shortTokenContract.redeemed.call(),
        shortTokenContract.baseToken.call(),
        proxyContract.transferAuthorized.call(tokenAddress)
      ]);

      expect(tokenShortSell).to.equal(shortSellContract.address);
      expect(tokenProxy).to.equal(proxyContract.address);
      expect(tokenShortId).to.equal(shortTx.id);
      expect(tokenState.equals(BIGNUMBERS.ZERO)).to.be.true;  // UNINITIALIZED
      expect(tokenName).to.equal(name);
      expect(tokenSymbol).to.equal(symbol);
      expect(tokenHolder).to.equal(initialTokenHolder);
      expect(tokenRedeemed.equals(BIGNUMBERS.ZERO)).to.be.true;
      expect(tokenBaseToken).to.equal(zeroAddr);
      expect(authorized).to.be.true;
    });

    it('fails when proxy has not granted access to TokenizedShortCreator', async () => {
      await expectThrow(() => tokenizedShortCreatorContract.tokenizeShort(
        initialTokenHolder, shortTx.id, name, symbol, { from: transactionSender }));
    });
  });
});
