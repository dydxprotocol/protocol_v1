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
  let dydxMargin, ERC20MarginPositionCreatorContract;

  before('retrieve deployed contracts', async () => {
    [
      dydxMargin,
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

  describe('#receivePositionOwnership', () => {
    async function checkSuccess(OpenTx, erc20Contract, remainingPrincipal) {
      const originalSeller = accounts[0];
      const [
        tokenMargin,
        tokenmarginId,
        tokenState,
        tokenHolder,
        tokenQuoteToken,
        totalSupply,
        ownerSupply,
      ] = await Promise.all([
        erc20Contract.MARGIN.call(),
        erc20Contract.MARGIN_ID.call(),
        erc20Contract.state.call(),
        erc20Contract.INITIAL_TOKEN_HOLDER.call(),
        erc20Contract.quoteToken.call(),
        erc20Contract.totalSupply.call(),
        erc20Contract.balanceOf.call(originalSeller),
      ]);

      expect(tokenMargin).to.equal(dydxMargin.address);
      expect(tokenmarginId).to.equal(OpenTx.id);
      expect(tokenState).to.be.bignumber.equal(TOKENIZED_POSITION_STATE.OPEN);
      expect(tokenHolder).to.equal(originalSeller);
      expect(tokenQuoteToken).to.equal(QuoteToken.address);
      expect(totalSupply).to.be.bignumber.equal(remainingPrincipal);
      expect(ownerSupply).to.be.bignumber.equal(remainingPrincipal);
    }

    it('fails for arbitrary caller', async () => {
      const badId = web3.fromAscii("06231993");
      await expectThrow(
        ERC20MarginPositionCreatorContract.receivePositionOwnership(accounts[0], badId)
      );
    });

    it('succeeds for new position', async () => {
      const OpenTx = await doOpenPosition(accounts, 1234, ERC20MarginPositionCreator.address);

      // Get the ERC20MarginPosition on the blockchain and make sure that it was created correctly
      const tokenAddress = await dydxMargin.getPositionOwner(OpenTx.id);
      const erc20Contract = await ERC20MarginPosition.at(tokenAddress);

      await checkSuccess(OpenTx, erc20Contract, OpenTx.principal);
    });

    it('succeeds for half-closed position', async () => {
      const salt = 5678;
      const OpenTx = await doOpenPosition(accounts, salt);

      // close half the position
      const sellOrder = await createSignedSellOrder(accounts, salt);
      await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
      await callClosePosition(
        dydxMargin,
        OpenTx,
        sellOrder,
        OpenTx.principal.div(2));

      // transfer position to ERC20MarginPositionCreator
      await dydxMargin.transferPosition(OpenTx.id, ERC20MarginPositionCreatorContract.address);

      // Get the ERC20MarginPosition on the blockchain and make sure that it was created correctly
      const tokenAddress = await dydxMargin.getPositionOwner(OpenTx.id);
      const erc20Contract = await ERC20MarginPosition.at(tokenAddress);

      await checkSuccess(OpenTx, erc20Contract, OpenTx.principal.div(2));
    });
  });
});
