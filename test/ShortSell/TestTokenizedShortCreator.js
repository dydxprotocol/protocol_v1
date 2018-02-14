/*global artifacts, contract, describe, it, before, beforeEach,*/

const expect = require('chai').expect;

const TokenizedShortCreator = artifacts.require("TokenizedShortCreator");
const TokenizedShort = artifacts.require("TokenizedShort");
const ShortSell = artifacts.require("ShortSell");
const ProxyContract = artifacts.require("Proxy");

const { ADDRESSES, BIGNUMBERS } = require('../helpers/Constants');
const { expectThrow } = require('../helpers/ExpectHelper');
const { doShort } = require('../helpers/ShortSellHelper');
const { transact } = require('../helpers/ContractHelper');

contract('TokenizedShortCreator', function(accounts) {
  let shortSellContract, tokenizedShortCreatorContract, proxyContract;

  before('retrieve deployed contracts', async () => {
    [
      shortSellContract,
      proxyContract,
      tokenizedShortCreatorContract
    ] = await Promise.all([
      ShortSell.deployed(),
      ProxyContract.deployed(),
      TokenizedShortCreator.deployed()
    ]);
  });

  describe('Constructor', () => {
    let contract;

    beforeEach('set up new TokenizedShortCreator contract', async () => {
      contract = await TokenizedShortCreator.new(shortSellContract.address);
    });

    it('sets constants correctly', async () => {
      const shortSellContractAddress = await contract.SHORT_SELL.call();
      expect(shortSellContractAddress).to.equal(shortSellContract.address);
    });
  });

  describe('#tokenizeShort', () => {
    const name = "Name";
    const symbol = "NAM";
    const initialTokenHolder = accounts[9];
    const transactionSender = accounts[8];
    let shortTx;

    before('set up short', async () => {
      shortTx = await doShort(accounts);
    });

    it('succeeds for arbitrary caller', async () => {
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
      const contract = await TokenizedShortCreator.new(
        shortSellContract.address,
      );

      // no access granted by proxy

      await expectThrow(() => contract.tokenizeShort(
        initialTokenHolder, shortTx.id, name, symbol, { from: transactionSender }));
    });
  });
});
