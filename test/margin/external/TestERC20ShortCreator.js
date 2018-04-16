/*global web3, artifacts, contract, describe, it, before*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const ERC20Short = artifacts.require("ERC20Short");
const HeldToken = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");

const { TOKENIZED_POSITION_STATE } = require('./ERC20ShortHelper');
const { expectAssertFailure, expectThrow } = require('../../helpers/ExpectHelper');
const {
  doOpenPosition,
  issueTokensAndSetAllowancesForClose,
  callClosePosition
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
      const dydxMarginAddress = await contract.DYDX_MARGIN.call();
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
      const trader = accounts[0];
      const [
        tokenMargin,
        tokenpositionId,
        tokenState,
        tokenHolder,
        tokenHeldToken,
        totalSupply,
        traderSupply,
      ] = await Promise.all([
        erc20Contract.DYDX_MARGIN.call(),
        erc20Contract.POSITION_ID.call(),
        erc20Contract.state.call(),
        erc20Contract.INITIAL_TOKEN_HOLDER.call(),
        erc20Contract.heldToken.call(),
        erc20Contract.totalSupply.call(),
        erc20Contract.balanceOf.call(trader),
      ]);

      expect(tokenMargin).to.equal(dydxMargin.address);
      expect(tokenpositionId).to.equal(OpenTx.id);
      expect(tokenState).to.be.bignumber.equal(TOKENIZED_POSITION_STATE.OPEN);
      expect(tokenHolder).to.equal(trader);
      expect(tokenHeldToken).to.equal(HeldToken.address);
      expect(totalSupply).to.be.bignumber.equal(remainingPrincipal);
      expect(traderSupply).to.be.bignumber.equal(remainingPrincipal);
    }

    it('fails for arbitrary caller', async () => {
      const badId = web3.fromAscii("06231993");
      await expectThrow(
        ERC20ShortCreatorContract.receivePositionOwnership(accounts[0], badId)
      );
    });

    it('succeeds for new position', async () => {
      const OpenTx = await doOpenPosition(accounts, 1234, ERC20ShortCreator.address);

      // Get the ERC20Short on the blockchain and make sure that it was created correctly
      const tokenAddress = await dydxMargin.getPositionOwner(OpenTx.id);
      const erc20Contract = await ERC20Short.at(tokenAddress);

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

      // transfer position to ERC20ShortCreator
      await dydxMargin.transferPosition(OpenTx.id, ERC20ShortCreatorContract.address);

      // Get the ERC20Short on the blockchain and make sure that it was created correctly
      const tokenAddress = await dydxMargin.getPositionOwner(OpenTx.id);
      const erc20Contract = await ERC20Short.at(tokenAddress);

      await checkSuccess(OpenTx, erc20Contract, OpenTx.principal.div(2));
    });
  });
});
