/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const Margin = artifacts.require("Margin");
const { wait } = require('@digix/tempo')(web3);
const {
  issueTokensAndSetAllowancesForClose,
  doShort,
  callCloseShort,
  getShort,
  issueForDirectClose,
  callCloseShortDirectly
} = require('../helpers/MarginHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');
const {
  checkSuccess,
  checkSuccessCloseDirectly
} = require('../helpers/CloseShortHelper');

const { expectThrow } = require('../helpers/ExpectHelper');

describe('#closeShort', () => {
  contract('Margin', function(accounts) {
    it('Successfully closes a short in increments', async () => {
      const shortTx = await doShort(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);

      // Close half the short at a time
      const closeAmount = shortTx.shortAmount.div(2);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      let closeTx = await callCloseShort(dydxMargin, shortTx, sellOrder, closeAmount);

      let exists = await dydxMargin.containsShort.call(shortTx.id);
      expect(exists).to.be.true;

      await checkSuccess(dydxMargin, shortTx, closeTx, sellOrder, closeAmount);

      const { closedAmount } = await getShort(dydxMargin, shortTx.id);

      expect(closedAmount).to.be.bignumber.equal(closeAmount);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      // Close the rest of the short
      await callCloseShort(dydxMargin, shortTx, sellOrder, closeAmount);
      exists = await dydxMargin.containsShort.call(shortTx.id);
      expect(exists).to.be.false;
    });
  });

  contract('Margin', function(accounts) {
    it('only allows the short seller to close', async () => {
      const shortTx = await doShort(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
      const closeAmount = shortTx.shortAmount.div(2);

      await expectThrow(
        callCloseShort(
          dydxMargin,
          shortTx,
          sellOrder,
          closeAmount,
          accounts[6]
        )
      );
    });
  });

  contract('Margin', function(accounts) {
    it('Only closes up to the current short amount', async () => {
      const shortTx = await doShort(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);

      // Try to close twice the short amount
      const closeAmount = shortTx.shortAmount.times(2);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      let closeTx = await callCloseShort(dydxMargin, shortTx, sellOrder, closeAmount);

      let exists = await dydxMargin.containsShort.call(shortTx.id);
      expect(exists).to.be.false;

      await checkSuccess(dydxMargin, shortTx, closeTx, sellOrder, shortTx.shortAmount);
    });
  });

  contract('Margin', function(accounts) {
    it('Successfully closes a short directly in increments', async () => {
      const shortTx = await doShort(accounts);

      // Give the short seller enough base token to close
      await issueForDirectClose(shortTx);

      const dydxMargin = await Margin.deployed();
      const closeAmount = shortTx.shortAmount.div(2);

      const closeTx = await callCloseShortDirectly(
        dydxMargin,
        shortTx,
        closeAmount
      );

      const exists = await dydxMargin.containsShort.call(shortTx.id);
      expect(exists).to.be.true;

      await checkSuccessCloseDirectly(dydxMargin, shortTx, closeTx, closeAmount);
    });
  });
});
