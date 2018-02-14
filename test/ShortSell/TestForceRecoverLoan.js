/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const { wait } = require('@digix/tempo')(web3);
const BaseToken = artifacts.require("TokenA");
const {
  doShortAndCall,
  placeAuctionBid
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

describe('#forceRecoverLoan', () => {
  contract('ShortSell', function(accounts) {
    it('allows funds to be recovered by the lender', async () => {
      const { shortSell, vault, underlyingToken, shortTx } = await doShortAndCall(accounts);
      await wait(shortTx.loanOffering.callTimeLimit);

      const baseTokenBalance = await shortSell.getShortBalance.call(shortTx.id);

      const tx = await shortSell.forceRecoverLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      console.log('\tShortSell.forceRecoverLoan gas used: ' + tx.receipt.gasUsed);

      const baseToken = await BaseToken.deployed();

      const [
        vaultUnderlyingTokenBalance,
        underlyingTokenBalanceOfVault,
        vaultBaseTokenBalance,
        baseTokenBalanceOfVault,
        shortExists,
        isShortClosed,
        lenderBaseTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address),
        vault.totalBalances.call(baseToken.address),
        baseToken.balanceOf.call(vault.address),
        shortSell.containsShort.call(shortTx.id),
        shortSell.isShortClosed.call(shortTx.id),
        baseToken.balanceOf.call(shortTx.loanOffering.lender)
      ]);

      expect(vaultUnderlyingTokenBalance).to.be.bignumber.equal(0);
      expect(underlyingTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultBaseTokenBalance).to.be.bignumber.equal(0);
      expect(baseTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(shortExists).to.be.false;
      expect(isShortClosed).to.be.true;
      expect(lenderBaseTokenBalance).to.be.bignumber.equal(baseTokenBalance);
    });
  });

  contract('ShortSell', function(accounts) {
    it('uses an auction bid if one exists', async () => {
      const { shortSell, vault, underlyingToken, shortTx } = await doShortAndCall(accounts);
      await wait(shortTx.loanOffering.callTimeLimit);
      const bidder = accounts[6];
      const bid = new BigNumber(200);
      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);
      const baseToken = await BaseToken.deployed();

      const [
        baseTokenBalance,
        shortSellerInitialBaseToken,
        interestFee
      ] = await Promise.all([
        shortSell.getShortBalance.call(shortTx.id),
        baseToken.balanceOf.call(shortTx.seller),
        shortSell.getShortInterestFee.call(shortTx.id)
      ]);

      const tx = await shortSell.forceRecoverLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      console.log('\tShortSell.forceRecoverLoan (with bid) gas used: ' + tx.receipt.gasUsed);

      const [
        vaultUnderlyingTokenBalance,
        underlyingTokenBalanceOfVault,
        vaultBaseTokenBalance,
        baseTokenBalanceOfVault,
        shortExists,
        isShortClosed,
        lenderBaseTokenBalance,
        bidderBaseTokenBalance,
        bidderUnderlyingTokenBalance,
        shortSellerBaseTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address),
        vault.totalBalances.call(baseToken.address),
        baseToken.balanceOf.call(vault.address),
        shortSell.containsShort.call(shortTx.id),
        shortSell.isShortClosed.call(shortTx.id),
        baseToken.balanceOf.call(shortTx.loanOffering.lender),
        baseToken.balanceOf.call(bidder),
        underlyingToken.balanceOf.call(bidder),
        baseToken.balanceOf.call(shortTx.seller),
      ]);

      const expectedShortSellerBaseToken = shortSellerInitialBaseToken
        .plus(baseTokenBalance)
        .minus(interestFee)
        .minus(bid);

      expect(vaultUnderlyingTokenBalance).to.be.bignumber.equal(0);
      expect(underlyingTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultBaseTokenBalance).to.be.bignumber.equal(0);
      expect(baseTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(shortExists).to.be.false;
      expect(isShortClosed).to.be.true;
      expect(lenderBaseTokenBalance).to.be.bignumber.equal(interestFee);
      expect(shortSellerBaseTokenBalance).to.be.bignumber.equal(expectedShortSellerBaseToken);
      expect(bidderBaseTokenBalance).to.be.bignumber.equal(bid);
      expect(bidderUnderlyingTokenBalance).to.be.bignumber.equal(0);
    });
  });

  contract('ShortSell', function(accounts) {
    it('allows the winning bidder to call', async () => {
      const { shortSell, underlyingToken, shortTx } = await doShortAndCall(accounts);
      await wait(shortTx.loanOffering.callTimeLimit);
      const bidder = accounts[6];
      const bid = new BigNumber(200);
      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);

      await shortSell.forceRecoverLoan(
        shortTx.id,
        { from: bidder }
      );
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows lender + bidder to call', async () => {
      const { shortSell, underlyingToken, shortTx } = await doShortAndCall(accounts);
      await wait(shortTx.loanOffering.callTimeLimit);
      const bidder = accounts[6];
      const bid = new BigNumber(200);
      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);

      await expectThrow( () => shortSell.forceRecoverLoan(
        shortTx.id,
        { from: accounts[7] }
      ));
    });
  });

  contract('ShortSell', function(accounts) {
    it('does not allow call before call time limit elapsed', async () => {
      const { shortSell, shortTx } = await doShortAndCall(accounts);

      await expectThrow( () => shortSell.forceRecoverLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      ));
    });
  });
});
