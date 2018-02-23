/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const { wait } = require('@digix/tempo')(web3);
const {
  createSigned0xSellOrder,
  issueTokensAndSetAllowancesForClose,
  doShort,
  callCloseShort,
  getShort,
  doShortAndCall,
  placeAuctionBid,
  issueForDirectClose,
  totalTokensForAddress
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
    it('sends tokens back to auction bidder if there is one', async () => {
      const { shortSell, safe, underlyingToken, shortTx } = await doShortAndCall(accounts);
      const sellOrder = await createSigned0xSellOrder(accounts);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);
      const bidder = accounts[6];
      const bid = new BigNumber(200);
      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);
      const closeAmount = shortTx.shortAmount.div(2);

      await callCloseShort(shortSell, shortTx, sellOrder, closeAmount);

      let bidderTokens = await totalTokensForAddress(underlyingToken, bidder, safe);
      expect(bidderTokens).to.be.bignumber.equal(0);

      await callCloseShort(shortSell, shortTx, sellOrder, closeAmount);

      bidderTokens = await totalTokensForAddress(underlyingToken, bidder, safe);
      expect(bidderTokens).to.be.bignumber.equal(shortTx.shortAmount);
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
    it('sends tokens back to auction bidder if there is one', async () => {
      const { shortSell, safe, underlyingToken, shortTx } = await doShortAndCall(accounts);
      await issueForDirectClose(shortTx);
      const bidder = accounts[6];
      const bid = new BigNumber(200);
      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);

      const closeTx = await shortSell.closeShortDirectly(
        shortTx.id,
        shortTx.shortAmount,
        { from: shortTx.seller }
      );

      const exists = await shortSell.containsShort.call(shortTx.id);
      expect(exists).to.be.false;

      const closeAmount = shortTx.shortAmount;

      await checkSuccessCloseDirectly(shortSell, shortTx, closeTx, closeAmount)

      const returnedTokens = await safe.withdrawableBalances.call(bidder, underlyingToken.address);
      expect(returnedTokens).to.be.bignumber.equal(shortTx.shortAmount);
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
