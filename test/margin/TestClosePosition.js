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
      const OpenPositionTx = await doOpenPosition(accounts);
      const [sellOrder, margin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);

      // Close half the position at a time
      const closeAmount = OpenPositionTx.marginAmount.div(2);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      let closeTx = await callClosePosition(margin, OpenPositionTx, sellOrder, closeAmount);

      let exists = await margin.containsPosition.call(OpenPositionTx.id);
      expect(exists).to.be.true;

      await checkSuccess(margin, OpenPositionTx, closeTx, sellOrder, closeAmount);

      const { closedAmount } = await getPosition(margin, OpenPositionTx.id);

      expect(closedAmount).to.be.bignumber.equal(closeAmount);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      // Close the rest of the position
      await callClosePosition(margin, OpenPositionTx, sellOrder, closeAmount);
      exists = await margin.containsPosition.call(OpenPositionTx.id);
      expect(exists).to.be.false;
    });
  });

  contract('Margin', function(accounts) {
    it('only allows the margin trader to close', async () => {
      const OpenPositionTx = await doOpenPosition(accounts);
      const [sellOrder, margin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);
      const closeAmount = OpenPositionTx.marginAmount.div(2);

      await expectThrow(
        callClosePosition(
          margin,
          OpenPositionTx,
          sellOrder,
          closeAmount,
          accounts[6]
        )
      );
    });
  });

  contract('Margin', function(accounts) {
    it('Only closes up to the current margin amount', async () => {
      const OpenPositionTx = await doOpenPosition(accounts);
      const [sellOrder, margin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);

      // Try to close twice the margin amount
      const closeAmount = OpenPositionTx.marginAmount.times(2);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      let closeTx = await callClosePosition(margin, OpenPositionTx, sellOrder, closeAmount);

      let exists = await margin.containsPosition.call(OpenPositionTx.id);
      expect(exists).to.be.false;

      await checkSuccess(margin, OpenPositionTx, closeTx, sellOrder, OpenPositionTx.marginAmount);
    });
  });

  contract('Margin', function(accounts) {
    it('Successfully closes a position directly in increments', async () => {
      const OpenPositionTx = await doOpenPosition(accounts);

      // Give the margin trader enough base token to close
      await issueForDirectClose(OpenPositionTx);

      const margin = await Margin.deployed();
      const closeAmount = OpenPositionTx.marginAmount.div(2);

      const closeTx = await callClosePositionDirectly(
        margin,
        OpenPositionTx,
        closeAmount
      );

      const exists = await margin.containsPosition.call(OpenPositionTx.id);
      expect(exists).to.be.true;

      await checkSuccessCloseDirectly(margin, OpenPositionTx, closeTx, closeAmount);
    });
  });
});
