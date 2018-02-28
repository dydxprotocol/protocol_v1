/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const { wait } = require('@digix/tempo')(web3);
const BaseToken = artifacts.require("TokenA");
const ShortSell = artifacts.require("ShortSell");
const {
  doShort,
  doShortAndCall,
  placeAuctionBid,
  totalTokensForAddress
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

describe('#forceRecoverLoan', () => {
  contract('ShortSell', function(accounts) {
    it.only('allows funds to be recovered by the lender', async () => {
      const { shortSell, vault, safe, underlyingToken, shortTx } = await doShortAndCall(accounts);
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
        lenderBaseTokenBalance,
        lenderSafeBaseTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address),
        vault.totalBalances.call(baseToken.address),
        baseToken.balanceOf.call(vault.address),
        shortSell.containsShort.call(shortTx.id),
        shortSell.isShortClosed.call(shortTx.id),
        baseToken.balanceOf.call(shortTx.loanOffering.lender),
        safe.withdrawableBalances.call(shortTx.loanOffering.lender, baseToken.address)
      ]);

      expect(vaultUnderlyingTokenBalance).to.be.bignumber.equal(0);
      expect(underlyingTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultBaseTokenBalance).to.be.bignumber.equal(0);
      expect(baseTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(shortExists).to.be.false;
      expect(isShortClosed).to.be.true;
      expect(lenderBaseTokenBalance).to.be.bignumber.equal(0);
      expect(lenderSafeBaseTokenBalance).to.be.bignumber.equal(baseTokenBalance);
    });
  });

  contract('ShortSell', function(accounts) {
    it('uses an auction bid if one exists', async () => {
      const { shortSell, vault, safe, underlyingToken, shortTx } = await doShortAndCall(accounts);
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
        shortSellerBaseTokenBalance,
      ] = await Promise.all([
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address),
        vault.totalBalances.call(baseToken.address),
        baseToken.balanceOf.call(vault.address),
        shortSell.containsShort.call(shortTx.id),
        shortSell.isShortClosed.call(shortTx.id),
        totalTokensForAddress(baseToken, shortTx.loanOffering.lender, safe),
        totalTokensForAddress(baseToken, bidder, safe),
        underlyingToken.balanceOf.call(bidder),
        totalTokensForAddress(baseToken, shortTx.seller, safe),
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
    it('does not allow before call time limit elapsed', async () => {
      const { shortSell, shortTx } = await doShortAndCall(accounts);
      await expectThrow( () => shortSell.forceRecoverLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      ));
    });
  });
  contract('ShortSell', function(accounts) {
    it('does not allow if not called or not reached maximumDuration+callTimeLimit', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      const maxDuration = shortTx.loanOffering.maxDuration;
      const almostMaxDuration = maxDuration - 100;
      const callTimeLimit = shortTx.loanOffering.callTimeLimit;
      expect(almostMaxDuration).to.be.at.least(callTimeLimit);

      // loan was not called and it is too early
      await wait(almostMaxDuration);
      await expectThrow(() => shortSell.forceRecoverLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      ));

      // now it's okay because we are past maxDuration+callTimeLimit
      await wait(callTimeLimit + 100);
      await shortSell.forceRecoverLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );
    });
  });
});
