/*global web3, artifacts, contract, describe, it, before*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ERC20MarginPositionCreator = artifacts.require("ERC20MarginPositionCreator");
const ERC20MarginPosition = artifacts.require("ERC20MarginPosition");
const QuoteToken = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");

const { TOKENIZED_POSITION_STATE } = require('../../helpers/ERC20MarginPositionHelper');
const { expectAssertFailure, expectThrow } = require('../../helpers/ExpectHelper');
const {
  doOpenPosition,
  issueTokensAndSetAllowancesForClose,
  callClosePosition
} = require('../../helpers/MarginHelper');
const {
  createSignedSellOrder
} = require('../../helpers/0xHelper');

contract('ERC20MarginPositionCreator', function(accounts) {
  let marginContract, ERC20MarginPositionCreatorContract;

  before('retrieve deployed contracts', async () => {
    [
      marginContract,
      ERC20MarginPositionCreatorContract
    ] = await Promise.all([
      Margin.deployed(),
      ERC20MarginPositionCreator.deployed()
    ]);
  });

  describe('Constructor', () => {
    let contract;
    it('sets constants correctly', async () => {
      const trustedRecipientsExpected = [accounts[8], accounts[9]];
      contract = await ERC20MarginPositionCreator.new(Margin.address, trustedRecipientsExpected);
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
    async function checkSuccess(openTx, tokenContract, remainingAmount) {
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
      expect(tokenMarginId).to.equal(openTx.id);
      expect(tokenState).to.be.bignumber.equal(TOKENIZED_POSITION_STATE.OPEN);
      expect(tokenHolder).to.equal(originalTrader);
      expect(tokenQuoteToken).to.equal(QuoteToken.address);
      expect(totalSupply).to.be.bignumber.equal(remainingAmount);
      expect(ownerSupply).to.be.bignumber.equal(remainingAmount);
    }

    it('fails for arbitrary caller', async () => {
      const badId = web3.fromAscii("06231993");
      await expectThrow(
        ERC20MarginPositionCreatorContract.receivePositionOwnership(accounts[0], badId)
      );
    });

    it('succeeds for new position', async () => {
      const openTx = await doOpenPosition(
        accounts,
        1234, // salt
        ERC20MarginPositionCreator.address // owner
      );

      // Get the
      const tokenAddress = await marginContract.getPositionTrader(openTx.id);

      // Get the ERC20MarginPosition on the blockchain and make sure that it was created correctly
      const tokenContract = await ERC20MarginPosition.at(tokenAddress);

      await checkSuccess(openTx, tokenContract, openTx.amount);
    });

    it('succeeds for half-closed position', async () => {
      const salt = 5678;
      const openTx = await doOpenPosition(accounts, salt);

      // close half the position
      const sellOrder = await createSignedSellOrder(accounts, salt);
      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
      await callClosePosition(
        marginContract,
        openTx,
        sellOrder,
        openTx.amount.div(2));

      // transfer position to ERC20MarginPositionCreator
      await marginContract.transferPosition(
        openTx.id,
        ERC20MarginPositionCreatorContract.address
      );

      // Get the owner of the position
      const tokenAddress = await marginContract.getPositionTrader(openTx.id);

      // Get the ERC20MarginPosition on the blockchain and make sure that it was created correctly
      const tokenContract = await ERC20MarginPosition.at(tokenAddress);

      await checkSuccess(openTx, tokenContract, openTx.amount.div(2));
    });
  });
});
