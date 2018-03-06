/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ShortSell = artifacts.require("ShortSell");
const { wait } = require('@digix/tempo')(web3);
const {
  createSigned0xSellOrder,
  issueTokensAndSetAllowancesForClose,
  doShort,
  callCloseShort,
  getShort,
  issueForDirectClose,
} = require('../helpers/ShortSellHelper');
const {
  checkSuccess,
  checkSuccessCloseDirectly
} = require('../helpers/CloseShortHelper');

const { expectThrow } = require('../helpers/ExpectHelper');

describe('#closeShort', () => {
  contract('ShortSell', function(accounts) {
    it('Successfully closes a short in increments', async () => {
      const shortTx = await doShort(accounts);
      const [sellOrder, shortSell] = await Promise.all([
        createSigned0xSellOrder(accounts),
        ShortSell.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);

      // Close half the short at a time
      const closeAmount = shortTx.shortAmount.div(2);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      let closeTx = await callCloseShort(shortSell, shortTx, sellOrder, closeAmount);

      let exists = await shortSell.containsShort.call(shortTx.id);
      expect(exists).to.be.true;

      await checkSuccess(shortSell, shortTx, closeTx, sellOrder, closeAmount);

      const { closedAmount } = await getShort(shortSell, shortTx.id);

      expect(closedAmount).to.be.bignumber.equal(closeAmount);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      // Close the rest of the short
      await callCloseShort(shortSell, shortTx, sellOrder, closeAmount);
      exists = await shortSell.containsShort.call(shortTx.id);
      expect(exists).to.be.false;
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the short seller to close', async () => {
      const shortTx = await doShort(accounts);
      const [sellOrder, shortSell] = await Promise.all([
        createSigned0xSellOrder(accounts),
        ShortSell.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
      const closeAmount = shortTx.shortAmount.div(2);

      await expectThrow(
        () => callCloseShort(
          shortSell,
          shortTx,
          sellOrder,
          closeAmount,
          accounts[6]
        )
      );
    });
  });

  contract('ShortSell', function(accounts) {
    it('Only closes up to the current short amount', async () => {
      const shortTx = await doShort(accounts);
      const [sellOrder, shortSell] = await Promise.all([
        createSigned0xSellOrder(accounts),
        ShortSell.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);

      // Try to close twice the short amount
      const closeAmount = shortTx.shortAmount.times(2);

      // Simulate time between open and close so interest fee needs to be paid
      await wait(10000);

      let closeTx = await callCloseShort(shortSell, shortTx, sellOrder, closeAmount);

      let exists = await shortSell.containsShort.call(shortTx.id);
      expect(exists).to.be.false;

      await checkSuccess(shortSell, shortTx, closeTx, sellOrder, shortTx.shortAmount);
    });
  });
});

describe('#closeShortDirectly', () => {
  contract('ShortSell', function(accounts) {
    it('Successfully closes a short in increments', async () => {
      const shortTx = await doShort(accounts);

      // Give the short seller enough underlying token to close
      await issueForDirectClose(shortTx);

      const shortSell = await ShortSell.deployed();
      const closeAmount = shortTx.shortAmount.div(2);

      const closeTx = await shortSell.closeShortDirectly(
        shortTx.id,
        closeAmount,
        { from: shortTx.seller }
      );

      const exists = await shortSell.containsShort.call(shortTx.id);
      expect(exists).to.be.true;

      await checkSuccessCloseDirectly(shortSell, shortTx, closeTx, closeAmount);
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the short seller to close', async () => {
      const shortTx = await doShort(accounts);
      const shortSell = await ShortSell.deployed();
      await issueForDirectClose(shortTx);
      const closeAmount = shortTx.shortAmount.div(2);

      await expectThrow(
        () => shortSell.closeShortDirectly(
          shortTx.id,
          closeAmount,
          { from: accounts[6] }
        )
      );
    });
  });

  contract('ShortSell', function(accounts) {
    it('Only closes up to the current short amount', async () => {
      const shortTx = await doShort(accounts);

      // Give the short seller enough underlying token to close
      await issueForDirectClose(shortTx);

      const shortSell = await ShortSell.deployed();
      const requestedCloseAmount = shortTx.shortAmount.times(2);

      const closeTx = await shortSell.closeShortDirectly(
        shortTx.id,
        requestedCloseAmount,
        { from: shortTx.seller }
      );

      const exists = await shortSell.containsShort.call(shortTx.id);
      expect(exists).to.be.false;

      const closeAmount = shortTx.shortAmount;

      await checkSuccessCloseDirectly(shortSell, shortTx, closeTx, closeAmount);
    });
  });
});
