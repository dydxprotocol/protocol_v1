/*global artifacts, contract, describe, it, before, beforeEach,*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const TokenizedShortCreator = artifacts.require("TokenizedShortCreator");
const TokenizedShort = artifacts.require("TokenizedShort");
const ShortSell = artifacts.require("ShortSell");

const { TOKENIZED_SHORT_STATE } = require('../helpers/TokenizedShortHelper');
const { ADDRESSES } = require('../helpers/Constants');
const { doShort } = require('../helpers/ShortSellHelper');
const { transact } = require('../helpers/ContractHelper');

contract('TokenizedShortCreator', function(accounts) {
  let shortSellContract, tokenizedShortCreatorContract;

  before('retrieve deployed contracts', async () => {
    [
      shortSellContract,
      tokenizedShortCreatorContract
    ] = await Promise.all([
      ShortSell.deployed(),
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
        tokenBaseToken,
      ] = await Promise.all([
        shortTokenContract.SHORT_SELL.call(),
        shortTokenContract.shortId.call(),
        shortTokenContract.state.call(),
        shortTokenContract.name.call(),
        shortTokenContract.symbol.call(),
        shortTokenContract.initialTokenHolder.call(),
        shortTokenContract.baseToken.call(),
      ]);

      expect(tokenShortSell).to.equal(shortSellContract.address);
      expect(tokenShortId).to.equal(shortTx.id);
      expect(tokenState).to.be.bignumber.equal(TOKENIZED_SHORT_STATE.UNINITIALIZED);
      expect(tokenName).to.equal(name);
      expect(tokenSymbol).to.equal(symbol);
      expect(tokenHolder).to.equal(initialTokenHolder);
      expect(tokenBaseToken).to.equal(ADDRESSES.ZERO);
    });
  });
});
