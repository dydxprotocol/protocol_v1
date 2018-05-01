/*global web3, artifacts, contract, describe, it, before*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ERC20Long = artifacts.require("ERC20Long");
const ERC20LongCreator = artifacts.require("ERC20LongCreator");
const ERC20Short = artifacts.require("ERC20Short");
const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const HeldToken = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");

const { getERC20PositionConstants, TOKENIZED_POSITION_STATE } = require('./ERC20PositionHelper');
const { expectAssertFailure, expectThrow } = require('../../helpers/ExpectHelper');
const {
  doOpenPosition,
  issueTokensAndSetAllowancesForClose,
  callClosePosition
} = require('../../helpers/MarginHelper');
const { createSignedSellOrder } = require('../../helpers/0xHelper');

const CREATORS = { ERC20ShortCreator, ERC20LongCreator };

contract('ERC20PositionCreator', function(accounts) {
  let dydxMargin;
  let salt = 112345;

  before('retrieve deployed contracts', async () => {
    [
      dydxMargin
    ] = await Promise.all([
      Margin.deployed()
    ]);
  });

  describe('Constructor', () => {
    let contract;
    it('sets constants correctly', async () => {
      const trustedRecipientsExpected = [accounts[8], accounts[9]];
      for (let creator in CREATORS) {
        contract = await CREATORS[creator].new(Margin.address, trustedRecipientsExpected);
        const dydxMarginAddress = await contract.DYDX_MARGIN.call();
        expect(dydxMarginAddress).to.equal(Margin.address);

        const numRecipients = trustedRecipientsExpected.length;
        for(let i = 0; i < numRecipients; i++) {
          const trustedRecipient = await contract.TRUSTED_RECIPIENTS.call(i);
          expect(trustedRecipient).to.equal(trustedRecipientsExpected[i]);
        }

        // cannot read from past the length of the array
        await expectAssertFailure(contract.TRUSTED_RECIPIENTS.call(numRecipients));
      }
    });
  });

  describe('#receivePositionOwnership', () => {
    async function checkSuccess(openTx, creator) {
      const trader = accounts[0];

      const [
        tokenAddress,
        balance,
        principal
      ] = await Promise.all([
        dydxMargin.getPositionOwner.call(openTx.id),
        dydxMargin.getPositionBalance.call(openTx.id),
        dydxMargin.getPositionPrincipal.call(openTx.id)
      ]);

      let erc20Contract;
      if (creator === 'ERC20ShortCreator') {
        erc20Contract = await ERC20Short.at(tokenAddress);
      } else {
        erc20Contract = await ERC20Long.at(tokenAddress);
      }

      const constants = await getERC20PositionConstants(erc20Contract);

      expect(constants.DYDX_MARGIN).to.equal(dydxMargin.address);
      expect(constants.POSITION_ID).to.equal(openTx.id);
      expect(constants.state).to.be.bignumber.equal(TOKENIZED_POSITION_STATE.OPEN);
      expect(constants.INITIAL_TOKEN_HOLDER).to.equal(trader);
      expect(constants.heldToken).to.equal(HeldToken.address);

      if (creator === 'ERC20ShortCreator') {
        expect(constants.totalSupply).to.be.bignumber.equal(principal);
      } else {
        expect(constants.totalSupply).to.be.bignumber.equal(balance);
      }
    }

    it('fails for arbitrary caller', async () => {
      const badId = web3.fromAscii("06231993");
      for (let creator in CREATORS) {
        const creatorContract = await CREATORS[creator].deployed();
        await expectThrow(
          creatorContract.receivePositionOwnership(accounts[0], badId)
        );
      }
    });

    it('succeeds for new position', async () => {
      for (let creator in CREATORS) {
        const openTx = await doOpenPosition(accounts, salt++, CREATORS[creator].address);
        await checkSuccess(openTx, creator);
      }
    });

    it('succeeds for half-closed position', async () => {
      for (let creator in CREATORS) {
        const openTx = await doOpenPosition(accounts, salt++);

        // close half the position
        const sellOrder = await createSignedSellOrder(accounts, salt++);
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await callClosePosition(
          dydxMargin,
          openTx,
          sellOrder,
          openTx.principal.div(2));

        // transfer position to ERC20PositionCreator
        await dydxMargin.transferPosition(openTx.id, CREATORS[creator].address);

        await checkSuccess(openTx, creator);
      }
    });
  });
});
