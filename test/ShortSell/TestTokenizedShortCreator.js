/*global artifacts, contract, describe, it, before, beforeEach, web3*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const TokenizedShortCreator = artifacts.require("TokenizedShortCreator");
const TokenizedShort = artifacts.require("TokenizedShort");
const ShortSell = artifacts.require("ShortSell");
const ProxyContract = artifacts.require("Proxy");

const { wait } = require('@digix/tempo')(web3);
const { ADDRESSES, BIGNUMBERS } = require('../helpers/Constants');
const { validateDelayedUpdateConstants } = require('../helpers/DelayedUpdateHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { doShort } = require('../helpers/ShortSellHelper');
const { transact } = require('../helpers/ContractHelper');

contract('TokenizedShortCreator', function(accounts) {
  const [updateDelay, updateExpiration] = [new BigNumber('112233'), new BigNumber('332211')];
  let shortSellContract, tokenizedShortCreatorContract, proxyContract;
  let shortTx;

  before('create a short', async () => {
    shortSellContract = await ShortSell.deployed();
    proxyContract = await ProxyContract.deployed();
    shortTx = await doShort(accounts);
  });

  beforeEach('set up TokenizedShortCreator contract', async () => {
    tokenizedShortCreatorContract = await TokenizedShortCreator.new(
      shortSellContract.address,
      updateDelay,
      updateExpiration);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      validateDelayedUpdateConstants(tokenizedShortCreatorContract, updateDelay, updateExpiration);
      const shortSellContractAddress = await tokenizedShortCreatorContract.SHORT_SELL.call();
      expect(shortSellContractAddress).to.equal(shortSellContract.address);
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

  describe('#tokenizeShort', () => {
    const name = "Name";
    const symbol = "NAM";
    const initialTokenHolder = accounts[9];
    const transactionSender = accounts[8];

    it('succeeds for arbitrary caller', async () => {
      console.log(initialTokenHolder);
      console.log(shortTx.id);
      console.log(name);
      console.log(symbol);

      // Get the return value of the tokenizeShort function
      const tokenAddress = await transact(tokenizedShortCreatorContract.tokenizeShort,
        initialTokenHolder, shortTx.id, name, symbol, { from: transactionSender });

      // Get the TokenizedShort on the blockchain and make sure that it was created correctly
      const shortTokenContract = await TokenizedShort.at(tokenAddress);
      const [
        tokenShortSell,
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
      expect(tokenShortId).to.equal(shortTx.id);
      expect(tokenState.equals(BIGNUMBERS.ZERO)).to.be.true;  // UNINITIALIZED
      expect(tokenName).to.equal(name);
      expect(tokenSymbol).to.equal(symbol);
      expect(tokenHolder).to.equal(initialTokenHolder);
      expect(tokenRedeemed.equals(BIGNUMBERS.ZERO)).to.be.true;
      expect(tokenBaseToken).to.equal(ADDRESSES.ZERO);
      expect(authorized).to.be.true;
    });

    it('fails when proxy has not granted access to TokenizedShortCreator', async () => {
      await expectThrow(() => tokenizedShortCreatorContract.tokenizeShort(
        initialTokenHolder, shortTx.id, name, symbol, { from: transactionSender }));
    });
  });
});
