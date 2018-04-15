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
      const OpenTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);

      // Close half the position at a time
      const closeAmount = OpenTx.principal.div(2);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      let closeTx = await callClosePosition(dydxMargin, OpenTx, sellOrder, closeAmount);

      let exists = await dydxMargin.containsPosition.call(OpenTx.id);
      expect(exists).to.be.true;

      await checkSuccess(dydxMargin, OpenTx, closeTx, sellOrder, closeAmount);

      const position = await getPosition(dydxMargin, OpenTx.id);

      expect(position.principal).to.be.bignumber.equal(OpenTx.principal.minus(closeAmount));

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      // Close the rest of the position
      await callClosePosition(dydxMargin, OpenTx, sellOrder, closeAmount);
      exists = await dydxMargin.containsPosition.call(OpenTx.id);
      expect(exists).to.be.false;
    });
  });

  contract('Margin', function(accounts) {
    it('only allows the position owner to close', async () => {
      const OpenTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
      const closeAmount = OpenTx.principal.div(2);

      await expectThrow(
        callClosePosition(
          dydxMargin,
          OpenTx,
          sellOrder,
          closeAmount,
          accounts[6]
        )
      );
    });
  });

  contract('Margin', function(accounts) {
    it('Only closes up to the current position principal', async () => {
      const OpenTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);

      // Try to close twice the position principal
      const closeAmount = OpenTx.principal.times(2);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      let closeTx = await callClosePosition(dydxMargin, OpenTx, sellOrder, closeAmount);

      let exists = await dydxMargin.containsPosition.call(OpenTx.id);
      expect(exists).to.be.false;

      await checkSuccess(dydxMargin, OpenTx, closeTx, sellOrder, OpenTx.principal);
    });
  });

  contract('Margin', function(accounts) {
    it('Successfully closes a position directly in increments', async () => {
      const OpenTx = await doOpenPosition(accounts);

      // Give the position owner enough base token to close
      await issueForDirectClose(OpenTx);

      const dydxMargin = await Margin.deployed();
      const closeAmount = OpenTx.principal.div(2);

      const closeTx = await callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        closeAmount
      );

      const exists = await dydxMargin.containsPosition.call(OpenTx.id);
      expect(exists).to.be.true;

      await checkSuccessCloseDirectly(dydxMargin, OpenTx, closeTx, closeAmount);
    });
  });
});
