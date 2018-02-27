/*global web3, artifacts, contract, describe, it, before, beforeEach,*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const TokenizedShortCreator = artifacts.require("TokenizedShortCreator");
const TokenizedShort = artifacts.require("TokenizedShort");
const BaseToken = artifacts.require("TokenA");
const ShortSell = artifacts.require("ShortSell");

const { TOKENIZED_SHORT_STATE } = require('../helpers/TokenizedShortHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const {
  doShort,
  createSigned0xSellOrder,
  issueTokensAndSetAllowancesForClose,
  callCloseShort
} = require('../helpers/ShortSellHelper');

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

  describe('#recieveShortOwnership', () => {
    async function checkSuccess(shortTx, shortTokenContract, remainingShortAmount) {
      const originalSeller = accounts[0];
      const [
        tokenShortSell,
        tokenShortId,
        tokenState,
        tokenHolder,
        tokenBaseToken,
        totalSupply,
        ownerSupply,
      ] = await Promise.all([
        shortTokenContract.SHORT_SELL.call(),
        shortTokenContract.shortId.call(),
        shortTokenContract.state.call(),
        shortTokenContract.initialTokenHolder.call(),
        shortTokenContract.baseToken.call(),
        shortTokenContract.totalSupply.call(),
        shortTokenContract.balanceOf.call(originalSeller),
      ]);

      expect(tokenShortSell).to.equal(shortSellContract.address);
      expect(tokenShortId).to.equal(shortTx.id);
      expect(tokenState).to.be.bignumber.equal(TOKENIZED_SHORT_STATE.OPEN);
      expect(tokenHolder).to.equal(originalSeller);
      expect(tokenBaseToken).to.equal(BaseToken.address);
      expect(totalSupply).to.be.bignumber.equal(remainingShortAmount);
      expect(ownerSupply).to.be.bignumber.equal(remainingShortAmount);
    }

    it('fails for arbitrary caller', async () => {
      const badId = web3.fromAscii("06231993");
      await expectThrow(
        () => tokenizedShortCreatorContract.recieveShortOwnership(accounts[0], badId));
    });

    it('succeeds for new short', async () => {
      const shortTx = await doShort(accounts, /* salt */ 1234, /* tokenized */ true);

      // Get the return value of the tokenizeShort function
      const tokenAddress = await shortSellContract.getShortSeller(shortTx.id);

      // Get the TokenizedShort on the blockchain and make sure that it was created correctly
      const shortTokenContract = await TokenizedShort.at(tokenAddress);

      await checkSuccess(shortTx, shortTokenContract, shortTx.shortAmount);
    });

    it('succeeds for half-closed short', async () => {
      const salt = 5678;
      const shortTx = await doShort(accounts, salt);

      // close half the short
      const sellOrder = await createSigned0xSellOrder(accounts, salt);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
      await callCloseShort(
        shortSellContract,
        shortTx,
        sellOrder,
        shortTx.shortAmount.div(2));

      // transfer short to TokenizedShortCreator
      await shortSellContract.transferShort(shortTx.id, tokenizedShortCreatorContract.address);

      // Get the return value of the tokenizeShort function
      const tokenAddress = await shortSellContract.getShortSeller(shortTx.id);

      // Get the TokenizedShort on the blockchain and make sure that it was created correctly
      const shortTokenContract = await TokenizedShort.at(tokenAddress);

      await checkSuccess(shortTx, shortTokenContract, shortTx.shortAmount.div(2));
    });
  });
});
