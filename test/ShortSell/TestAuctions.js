/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const { wait } = require('@digix/tempo')(web3);
const ProxyContract = artifacts.require("Proxy");
const {
  getShortAuctionOffer,
  placeAuctionBid,
  doShortAndCall
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

describe('#placeSellbackBid', () => {
  contract('ShortSell', function(accounts) {
    it('successfully places an auction bid', async () => {
      const bidder = accounts[6];
      const bid = new BigNumber(100);
      const { shortSell, vault, underlyingToken, shortTx } = await doShortAndCall(accounts);

      const tx = await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);

      console.log('\tShortSell.placeSellbackBid (no refund) gas used: ' + tx.receipt.gasUsed);

      const [
        auctionOffer,
        auctionExists,
        vaultUnderlyingTokenBalance,
        tokenBalanceOfVault
      ] = await Promise.all([
        getShortAuctionOffer(shortSell, shortTx.id),
        shortSell.hasShortAuctionOffer.call(shortTx.id),
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address)
      ]);

      expect(auctionExists).to.be.true;
      expect(auctionOffer.offer).to.be.bignumber.equal(bid);
      expect(auctionOffer.bidder.toLowerCase()).to.eq(bidder.toLowerCase());
      expect(auctionOffer.exists).to.be.true;
      expect(vaultUnderlyingTokenBalance).to.be.bignumber.equal(shortTx.shortAmount);
      expect(tokenBalanceOfVault).to.be.bignumber.equal(shortTx.shortAmount);
    });
  });

  contract('ShortSell', function(accounts) {
    it('replaces and refunds a higher bid if one exists', async () => {
      const bidder = accounts[6];
      const bidder2 = accounts[7];
      const bid = new BigNumber(200);
      const bid2 = new BigNumber(100);
      const { shortSell, vault, safe, underlyingToken, shortTx } = await doShortAndCall(accounts);

      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);
      const tx = await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder2, bid2);

      console.log('\tShortSell.placeSellbackBid (with refund) gas used: ' + tx.receipt.gasUsed);

      const [
        auctionOffer,
        auctionExists,
        vaultUnderlyingTokenBalance,
        tokenBalanceOfVault,
        bidderBalance,
        bidder2Balance,
        bidderSafeBalance,
        bidder2SafeBalance
      ] = await Promise.all([
        getShortAuctionOffer(shortSell, shortTx.id),
        shortSell.hasShortAuctionOffer.call(shortTx.id),
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address),
        underlyingToken.balanceOf.call(bidder),
        underlyingToken.balanceOf.call(bidder2),
        safe.withdrawableBalances.call(bidder, underlyingToken.address),
        safe.withdrawableBalances.call(bidder2, underlyingToken.address)
      ]);

      expect(auctionExists).to.be.true;
      expect(auctionOffer.offer).to.be.bignumber.equal(bid2);
      expect(auctionOffer.bidder.toLowerCase()).to.eq(bidder2.toLowerCase());
      expect(auctionOffer.exists).to.be.true;
      expect(vaultUnderlyingTokenBalance).to.be.bignumber.equal(shortTx.shortAmount);
      expect(tokenBalanceOfVault).to.be.bignumber.equal(shortTx.shortAmount);
      expect(bidderBalance).to.be.bignumber.equal(0);
      expect(bidderSafeBalance).to.be.bignumber.equal(shortTx.shortAmount);
      expect(bidder2Balance).to.be.bignumber.equal(0);
      expect(bidder2SafeBalance).to.be.bignumber.equal(0);
    });
  });

  contract('ShortSell', function(accounts) {
    it('does not replace a lower bid', async () => {
      const bidder = accounts[6];
      const bidder2 = accounts[7];
      const bid = new BigNumber(100);
      const bid2 = new BigNumber(200);
      const { shortSell, vault, underlyingToken, shortTx } = await doShortAndCall(accounts);

      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);
      await expectThrow(
        () => placeAuctionBid(shortSell, underlyingToken, shortTx, bidder2, bid2)
      );

      const [
        auctionOffer,
        auctionExists,
        vaultUnderlyingTokenBalance,
        tokenBalanceOfVault,
        bidderBalance,
        bidder2Balance
      ] = await Promise.all([
        getShortAuctionOffer(shortSell, shortTx.id),
        shortSell.hasShortAuctionOffer.call(shortTx.id),
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address),
        underlyingToken.balanceOf.call(bidder),
        underlyingToken.balanceOf.call(bidder2),
      ]);

      expect(auctionExists).to.be.true;
      expect(auctionOffer.offer).to.be.bignumber.equal(bid);
      expect(auctionOffer.bidder.toLowerCase()).to.eq(bidder.toLowerCase());
      expect(auctionOffer.exists).to.be.true;
      expect(vaultUnderlyingTokenBalance).to.be.bignumber.equal(shortTx.shortAmount);
      expect(tokenBalanceOfVault).to.be.bignumber.equal(shortTx.shortAmount);
      expect(bidderBalance).to.be.bignumber.equal(0);
      expect(bidder2Balance).to.be.bignumber.equal(shortTx.shortAmount);
    });
  });

  contract('ShortSell', function(accounts) {
    it('fails if the short has not been called', async () => {
      const bidder = accounts[6];
      const bid = new BigNumber(100);
      const { shortSell, underlyingToken, shortTx } = await doShortAndCall(accounts);
      await shortSell.cancelLoanCall(shortTx.id, { from: shortTx.loanOffering.lender });

      await expectThrow(
        () => placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid)
      );
    });
  });

  contract('ShortSell', function(accounts) {
    it('allows bid if short is over duration', async () => {
      const bidder = accounts[6];
      const bid = new BigNumber(100);
      const { shortSell, vault, underlyingToken, shortTx } = await doShortAndCall(accounts);
      await shortSell.cancelLoanCall(shortTx.id, { from: shortTx.loanOffering.lender });
      await wait(shortTx.loanOffering.maxDuration);

      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);

      const [
        auctionOffer,
        auctionExists,
        vaultUnderlyingTokenBalance,
        tokenBalanceOfVault
      ] = await Promise.all([
        getShortAuctionOffer(shortSell, shortTx.id),
        shortSell.hasShortAuctionOffer.call(shortTx.id),
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address)
      ]);

      expect(auctionExists).to.be.true;
      expect(auctionOffer.offer).to.be.bignumber.equal(bid);
      expect(auctionOffer.bidder.toLowerCase()).to.eq(bidder.toLowerCase());
      expect(auctionOffer.exists).to.be.true;
      expect(vaultUnderlyingTokenBalance).to.be.bignumber.equal(shortTx.shortAmount);
      expect(tokenBalanceOfVault).to.be.bignumber.equal(shortTx.shortAmount);
    });
  });

  contract('ShortSell', function(accounts) {
    it('only takes the current short amount from bidder', async () => {
      const bidder = accounts[6];
      const bid = new BigNumber(100);
      const { shortSell, vault, underlyingToken, shortTx } = await doShortAndCall(accounts);

      // Partially close short
      const closeAmount = shortTx.shortAmount.div(3).floor();
      await underlyingToken.issue(closeAmount, { from: shortTx.seller });
      await underlyingToken.approve(ProxyContract.address, closeAmount, { from: shortTx.seller });
      await shortSell.closeShortDirectly(shortTx.id, closeAmount, { from: shortTx.seller });

      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);

      const currentShortAmount = shortTx.shortAmount.minus(closeAmount);

      const [
        auctionOffer,
        auctionExists,
        vaultUnderlyingTokenBalance,
        tokenBalanceOfVault,
        bidderTokenBalance
      ] = await Promise.all([
        getShortAuctionOffer(shortSell, shortTx.id),
        shortSell.hasShortAuctionOffer.call(shortTx.id),
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address),
        underlyingToken.balanceOf.call(bidder),
      ]);

      expect(auctionExists).to.be.true;
      expect(auctionOffer.offer).to.be.bignumber.equal(bid);
      expect(auctionOffer.bidder.toLowerCase()).to.eq(bidder.toLowerCase());
      expect(auctionOffer.exists).to.be.true;
      expect(vaultUnderlyingTokenBalance).to.be.bignumber.equal(currentShortAmount);
      expect(tokenBalanceOfVault).to.be.bignumber.equal(currentShortAmount);
      expect(bidderTokenBalance).to.be.bignumber.equal(closeAmount);
    });
  });

  contract('ShortSell', function(accounts) {
    it('fails if the bid is higher than the short balance - interest fee', async () => {
      const { shortSell, underlyingToken, shortTx } = await doShortAndCall(accounts);
      const bidder = accounts[6];

      // Bidding the current short balance should be too high as some interest fee must be paid
      const bid = await shortSell.getShortBalance(shortTx.id);

      await expectThrow( () => placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid) );
    });
  });
});
