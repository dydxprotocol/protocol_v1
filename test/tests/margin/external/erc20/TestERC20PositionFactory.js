const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ERC20Long = artifacts.require("ERC20Long");
const ERC20LongFactory = artifacts.require("ERC20LongFactory");
const ERC20Short = artifacts.require("ERC20Short");
const ERC20ShortFactory = artifacts.require("ERC20ShortFactory");
const HeldToken = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");

const { getERC20PositionConstants, TOKENIZED_POSITION_STATE } = require('./ERC20PositionHelper');
const { expectAssertFailure, expectThrow } = require('../../../../helpers/ExpectHelper');
const {
  doOpenPosition,
  issueTokensAndSetAllowancesForClose,
  callClosePosition
} = require('../../../../helpers/MarginHelper');
const { createSignedV1SellOrder } = require('../../../../helpers/ZeroExV1Helper');

const FACTORIES = { ERC20ShortFactory, ERC20LongFactory };

contract('ERC20PositionFactory', accounts => {
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
      const trustedWithdrawersExpected = [accounts[6], accounts[7]];
      for (let factory in FACTORIES) {
        contract = await FACTORIES[factory].new(
          Margin.address,
          trustedRecipientsExpected,
          trustedWithdrawersExpected,
        );
        const dydxMarginAddress = await contract.DYDX_MARGIN.call();
        expect(dydxMarginAddress).to.equal(Margin.address);

        const numRecipients = trustedRecipientsExpected.length;
        for (let i = 0; i < numRecipients; i++) {
          const trustedRecipient = await contract.TRUSTED_RECIPIENTS.call(i);
          expect(trustedRecipient).to.equal(trustedRecipientsExpected[i]);
        }

        const numWithdrawers = trustedWithdrawersExpected.length;
        for (let i = 0; i < numWithdrawers; i++) {
          const trustedWithdrawer = await contract.TRUSTED_WITHDRAWERS.call(i);
          expect(trustedWithdrawer).to.equal(trustedWithdrawersExpected[i]);
        }

        // cannot read from past the length of the array
        await expectAssertFailure(contract.TRUSTED_RECIPIENTS.call(numRecipients));
        await expectAssertFailure(contract.TRUSTED_WITHDRAWERS.call(numWithdrawers));
      }
    });
  });

  describe('#receivePositionOwnership', () => {
    async function checkSuccess(openTx, factory) {
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
      if (factory === 'ERC20ShortFactory') {
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

      if (factory === 'ERC20ShortFactory') {
        expect(constants.totalSupply).to.be.bignumber.equal(principal);
      } else {
        expect(constants.totalSupply).to.be.bignumber.equal(balance);
      }
    }

    it('fails for arbitrary caller', async () => {
      const badId = web3.fromAscii("06231993");
      for (let factory in FACTORIES) {
        const factoryContract = await FACTORIES[factory].deployed();
        await expectThrow(
          factoryContract.receivePositionOwnership(accounts[0], badId)
        );
      }
    });

    it('succeeds for new position', async () => {
      for (let factory in FACTORIES) {
        const openTx = await doOpenPosition(
          accounts,
          {
            salt: salt++,
            positionOwner: FACTORIES[factory].address
          }
        );
        await checkSuccess(openTx, factory);
      }
    });

    it('succeeds for half-closed position', async () => {
      for (let factory in FACTORIES) {
        const openTx = await doOpenPosition(accounts, { salt: salt++ });

        // close half the position
        const sellOrder = await createSignedV1SellOrder(accounts, { salt: salt++ });
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
        await callClosePosition(
          dydxMargin,
          openTx,
          sellOrder,
          openTx.principal.div(2).floor());

        // transfer position to ERC20PositionFactory
        await dydxMargin.transferPosition(openTx.id, FACTORIES[factory].address);

        await checkSuccess(openTx, factory);
      }
    });
  });
});
