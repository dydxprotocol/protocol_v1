/*global web3, artifacts, contract, describe, it, before, beforeEach,*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const ERC20Short = artifacts.require("ERC20Short");
const BaseToken = artifacts.require("TokenA");
const ShortSell = artifacts.require("ShortSell");

const { ADDRESSES } = require('../helpers/Constants');
const { TOKENIZED_SHORT_STATE } = require('../helpers/ERC20ShortHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const {
  doShort,
  issueTokensAndSetAllowancesForClose,
  callCloseShort
} = require('../helpers/ShortSellHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');

contract('ERC20ShortCreator', function(accounts) {
  let shortSellContract, ERC20ShortCreatorContract;

  before('retrieve deployed contracts', async () => {
    [
      shortSellContract,
      ERC20ShortCreatorContract
    ] = await Promise.all([
      ShortSell.deployed(),
      ERC20ShortCreator.deployed()
    ]);
  });

  describe('Constructor', () => {
    let contract;

    beforeEach('set up new ERC20ShortCreator contract', async () => {
      contract = await ERC20ShortCreator.new(ShortSell.address, []);
    });

    it('sets constants correctly', async () => {
      const shortSellContractAddress = await contract.SHORT_SELL.call();
      expect(shortSellContractAddress).to.equal(ShortSell.address);
    });
  });

  describe('#receiveShortOwnership', () => {
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
        shortTokenContract.SHORT_ID.call(),
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
        () => ERC20ShortCreatorContract.receiveShortOwnership(accounts[0], badId));
    });

    it('succeeds for new short', async () => {
      const shortTx = await doShort(accounts, /*salt*/ 1234, /*owner*/ ERC20ShortCreator.address);

      // Get the return value of the tokenizeShort function
      const tokenAddress = await shortSellContract.getShortSeller(shortTx.id);

      // Get the ERC20Short on the blockchain and make sure that it was created correctly
      const shortTokenContract = await ERC20Short.at(tokenAddress);

      await checkSuccess(shortTx, shortTokenContract, shortTx.shortAmount);
    });

    it('succeeds for half-closed short', async () => {
      const salt = 5678;
      const shortTx = await doShort(accounts, salt);

      // close half the short
      const sellOrder = await createSignedSellOrder(accounts, salt);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
      await callCloseShort(
        shortSellContract,
        shortTx,
        sellOrder,
        shortTx.shortAmount.div(2));

      // transfer short to ERC20ShortCreator
      await shortSellContract.transferShort(shortTx.id, ERC20ShortCreatorContract.address);

      // Get the return value of the tokenizeShort function
      const tokenAddress = await shortSellContract.getShortSeller(shortTx.id);

      // Get the ERC20Short on the blockchain and make sure that it was created correctly
      const shortTokenContract = await ERC20Short.at(tokenAddress);

      await checkSuccess(shortTx, shortTokenContract, shortTx.shortAmount.div(2));
    });
  });
});
