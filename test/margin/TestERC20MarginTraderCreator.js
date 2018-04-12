/*global web3, artifacts, contract, describe, it, before*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ERC20MarginTraderCreator = artifacts.require("ERC20MarginTraderCreator");
const ERC20MarginTrader = artifacts.require("ERC20MarginTrader");
const QuoteToken = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");

const { TOKENIZED_POSITION_STATE } = require('../helpers/ERC20MarginTraderHelper');
const { expectAssertFailure, expectThrow } = require('../helpers/ExpectHelper');
const {
  doOpenPosition,
  issueTokensAndSetAllowancesForClose,
  callClosePosition
} = require('../helpers/MarginHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');

contract('ERC20MarginTraderCreator', function(accounts) {
  let marginContract, ERC20MarginTraderCreatorContract;

  before('retrieve deployed contracts', async () => {
    [
      marginContract,
      ERC20MarginTraderCreatorContract
    ] = await Promise.all([
      Margin.deployed(),
      ERC20MarginTraderCreator.deployed()
    ]);
  });

  describe('Constructor', () => {
    let contract;
    it('sets constants correctly', async () => {
      const trustedRecipientsExpected = [accounts[8], accounts[9]];
      contract = await ERC20MarginTraderCreator.new(Margin.address, trustedRecipientsExpected);
      const marginContractAddress = await contract.MARGIN.call();
      expect(marginContractAddress).to.equal(Margin.address);

      const numRecipients = trustedRecipientsExpected.length;
      for(let i = 0; i < numRecipients; i++) {
        const trustedRecipient = await contract.TRUSTED_RECIPIENTS.call(i);
        expect(trustedRecipient).to.equal(trustedRecipientsExpected[i]);
      }

      // cannot read from past the length of the array
      await expectAssertFailure(contract.TRUSTED_RECIPIENTS.call(numRecipients));
    });
  });

  describe('#receivePositionOwnership', () => {
    async function checkSuccess(OpenPositionTx, tokenContract, remainingAmount) {
      const originalTrader = accounts[0];
      const [
        tokenMargin,
        tokenMarginId,
        tokenState,
        tokenHolder,
        tokenQuoteToken,
        totalSupply,
        ownerSupply,
      ] = await Promise.all([
        tokenContract.MARGIN.call(),
        tokenContract.MARGIN_ID.call(),
        tokenContract.state.call(),
        tokenContract.INITIAL_TOKEN_HOLDER.call(),
        tokenContract.quoteToken.call(),
        tokenContract.totalSupply.call(),
        tokenContract.balanceOf.call(originalTrader),
      ]);

      expect(tokenMargin).to.equal(marginContract.address);
      expect(tokenMarginId).to.equal(OpenPositionTx.id);
      expect(tokenState).to.be.bignumber.equal(TOKENIZED_POSITION_STATE.OPEN);
      expect(tokenHolder).to.equal(originalTrader);
      expect(tokenQuoteToken).to.equal(QuoteToken.address);
      expect(totalSupply).to.be.bignumber.equal(remainingAmount);
      expect(ownerSupply).to.be.bignumber.equal(remainingAmount);
    }

    it('fails for arbitrary caller', async () => {
      const badId = web3.fromAscii("06231993");
      await expectThrow(
        ERC20MarginTraderCreatorContract.receivePositionOwnership(accounts[0], badId)
      );
    });

    it('succeeds for new margin position', async () => {
      const OpenPositionTx = await doOpenPosition(accounts, /*salt*/ 1234, /*owner*/ ERC20MarginTraderCreator.address);

      // Get the
      const tokenAddress = await marginContract.getPositionTrader(OpenPositionTx.id);

      // Get the ERC20MarginTrader on the blockchain and make sure that it was created correctly
      const tokenContract = await ERC20MarginTrader.at(tokenAddress);

      await checkSuccess(OpenPositionTx, tokenContract, OpenPositionTx.marginAmount);
    });

    it('succeeds for half-closed position', async () => {
      const salt = 5678;
      const OpenPositionTx = await doOpenPosition(accounts, salt);

      // close half the position
      const sellOrder = await createSignedSellOrder(accounts, salt);
      await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
      await callClosePosition(
        marginContract,
        OpenPositionTx,
        sellOrder,
        OpenPositionTx.marginAmount.div(2));

      // transfer position to ERC20MarginTraderCreator
      await marginContract.transferPosition(OpenPositionTx.id, ERC20MarginTraderCreatorContract.address);

      // Get the owner of the position
      const tokenAddress = await marginContract.getPositionTrader(OpenPositionTx.id);

      // Get the ERC20MarginTrader on the blockchain and make sure that it was created correctly
      const tokenContract = await ERC20MarginTrader.at(tokenAddress);

      await checkSuccess(OpenPositionTx, tokenContract, OpenPositionTx.marginAmount.div(2));
    });
  });
});
