/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const Margin = artifacts.require("Margin");
const { wait } = require('@digix/tempo')(web3);
const {
  issueTokensAndSetAllowancesForClose,
  doOpenPosition,
  callClosePosition,
  getPosition,
  issueForDirectClose,
  callClosePositionDirectly
} = require('../helpers/MarginHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');
const {
  checkSuccess,
  checkSuccessCloseDirectly
} = require('../helpers/ClosePositionHelper');

const { expectThrow } = require('../helpers/ExpectHelper');

describe('#closePosition', () => {
  contract('Margin', function(accounts) {
    it('Successfully closes a position in increments', async () => {
      const openTx = await doOpenPosition(accounts);
      const [sellOrder, margin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

      // Close half the position at a time
      const closeAmount = openTx.amount.div(2);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      let closeTx = await callClosePosition(margin, openTx, sellOrder, closeAmount);

      let exists = await margin.containsPosition.call(openTx.id);
      expect(exists).to.be.true;

      await checkSuccess(margin, openTx, closeTx, sellOrder, closeAmount);

      const { closedAmount } = await getPosition(margin, openTx.id);

      expect(closedAmount).to.be.bignumber.equal(closeAmount);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      // Close the rest of the position
      await callClosePosition(margin, openTx, sellOrder, closeAmount);
      exists = await margin.containsPosition.call(openTx.id);
      expect(exists).to.be.false;
    });
  });

  contract('Margin', function(accounts) {
    it('only allows the trader to close', async () => {
      const openTx = await doOpenPosition(accounts);
      const [sellOrder, margin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
      const closeAmount = openTx.amount.div(2);

      await expectThrow(
        callClosePosition(
          margin,
          openTx,
          sellOrder,
          closeAmount,
          accounts[6]
        )
      );
    });
  });

  contract('Margin', function(accounts) {
    it('Only closes up to the current position amount', async () => {
      const openTx = await doOpenPosition(accounts);
      const [sellOrder, margin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

      // Try to close twice the position amount
      const closeAmount = openTx.amount.times(2);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      let closeTx = await callClosePosition(margin, openTx, sellOrder, closeAmount);

      let exists = await margin.containsPosition.call(openTx.id);
      expect(exists).to.be.false;

      await checkSuccess(margin, openTx, closeTx, sellOrder, openTx.amount);
    });
  });

  contract('Margin', function(accounts) {
    it('Successfully closes a position directly in increments', async () => {
      const openTx = await doOpenPosition(accounts);

      // Give the trader enough base token to close
      await issueForDirectClose(openTx);

      const margin = await Margin.deployed();
      const closeAmount = openTx.amount.div(2);

      const closeTx = await callClosePositionDirectly(
        margin,
        openTx,
        closeAmount
      );

      const exists = await margin.containsPosition.call(openTx.id);
      expect(exists).to.be.true;

      await checkSuccessCloseDirectly(margin, openTx, closeTx, closeAmount);
    });
  });
});
