/*global web3, artifacts, contract, describe, it, before*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const ERC20Short = artifacts.require("ERC20Short");
const QuoteToken = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");

const { TOKENIZED_SHORT_STATE } = require('../../helpers/ERC20ShortHelper');
const { expectAssertFailure, expectThrow } = require('../../helpers/ExpectHelper');
const {
  doShort,
  issueTokensAndSetAllowancesForClose,
  callCloseShort
} = require('../../helpers/MarginHelper');
const {
  createSignedSellOrder
} = require('../../helpers/0xHelper');

contract('ERC20ShortCreator', function(accounts) {
  let dydxMargin, ERC20ShortCreatorContract;

  before('retrieve deployed contracts', async () => {
    [
      dydxMargin,
      ERC20ShortCreatorContract
    ] = await Promise.all([
      Margin.deployed(),
      ERC20ShortCreator.deployed()
    ]);
  });

  describe('Constructor', () => {
    let contract;
    it('sets constants correctly', async () => {
      const trustedRecipientsExpected = [accounts[8], accounts[9]];
      contract = await ERC20ShortCreator.new(Margin.address, trustedRecipientsExpected);
      const dydxMarginAddress = await contract.MARGIN.call();
      expect(dydxMarginAddress).to.equal(Margin.address);

      const numRecipients = trustedRecipientsExpected.length;
      for(let i = 0; i < numRecipients; i++) {
        const trustedRecipient = await contract.TRUSTED_RECIPIENTS.call(i);
        expect(trustedRecipient).to.equal(trustedRecipientsExpected[i]);
      }

      // cannot read from past the length of the array
      await expectAssertFailure(contract.TRUSTED_RECIPIENTS.call(numRecipients));
    });
  });

  describe('#receiveShortOwnership', () => {
    async function checkSuccess(shortTx, shortTokenContract, remainingShortAmount) {
      const originalSeller = accounts[0];
      const [
        tokenMargin,
        tokenShortId,
        tokenState,
        tokenHolder,
        tokenQuoteToken,
        totalSupply,
        ownerSupply,
      ] = await Promise.all([
        shortTokenContract.MARGIN.call(),
        shortTokenContract.SHORT_ID.call(),
        shortTokenContract.state.call(),
        shortTokenContract.INITIAL_TOKEN_HOLDER.call(),
        shortTokenContract.quoteToken.call(),
        shortTokenContract.totalSupply.call(),
        shortTokenContract.balanceOf.call(originalSeller),
      ]);

      expect(tokenMargin).to.equal(dydxMargin.address);
      expect(tokenShortId).to.equal(shortTx.id);
      expect(tokenState).to.be.bignumber.equal(TOKENIZED_SHORT_STATE.OPEN);
      expect(tokenHolder).to.equal(originalSeller);
      expect(tokenQuoteToken).to.equal(QuoteToken.address);
      expect(totalSupply).to.be.bignumber.equal(remainingShortAmount);
      expect(ownerSupply).to.be.bignumber.equal(remainingShortAmount);
    }

    it('fails for arbitrary caller', async () => {
      const badId = web3.fromAscii("06231993");
      await expectThrow(
        ERC20ShortCreatorContract.receiveShortOwnership(accounts[0], badId)
      );
    });

    it('succeeds for new short', async () => {
      const shortTx = await doShort(accounts, /*salt*/ 1234, /*owner*/ ERC20ShortCreator.address);

      // Get the return value of the tokenizeShort function
      const tokenAddress = await dydxMargin.getshortSeller(shortTx.id);

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
        dydxMargin,
        shortTx,
        sellOrder,
        shortTx.shortAmount.div(2));

      // transfer short to ERC20ShortCreator
      await dydxMargin.transferShort(shortTx.id, ERC20ShortCreatorContract.address);

      // Get the return value of the tokenizeShort function
      const tokenAddress = await dydxMargin.getshortSeller(shortTx.id);

      // Get the ERC20Short on the blockchain and make sure that it was created correctly
      const shortTokenContract = await ERC20Short.at(tokenAddress);

      await checkSuccess(shortTx, shortTokenContract, shortTx.shortAmount.div(2));
    });
  });
});
