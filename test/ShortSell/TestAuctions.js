/*global artifacts, web3, contract, describe, it*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const { wait } = require('@digix/tempo')(web3);
const ShortSell = artifacts.require("ShortSell");
const UnderlyingToken = artifacts.require("TokenB");
const Vault = artifacts.require("Vault");
const {
  doShort,
  getShortAuctionOffer,
  placeAuctionBid
} = require('../helpers/ShortSellHelper');

async function doShortAndCall(accounts) {
  const [shortSell, vault, underlyingToken] = await Promise.all([
    ShortSell.deployed(),
    Vault.deployed(),
    UnderlyingToken.deployed()
  ]);

  const shortTx = await doShort(accounts);

  await wait(shortTx.loanOffering.lockoutTime);
  await shortSell.callInLoan(
    shortTx.id,
    { from: shortTx.loanOffering.lender }
  );

  return { shortSell, vault, underlyingToken, shortTx };
}

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
      expect(auctionOffer.offer.equals(bid)).to.be.true;
      expect(auctionOffer.bidder.toLowerCase()).to.eq(bidder.toLowerCase());
      expect(auctionOffer.exists).to.be.true;
      expect(vaultUnderlyingTokenBalance.equals(shortTx.shortAmount)).to.be.true;
      expect(tokenBalanceOfVault.equals(shortTx.shortAmount)).to.be.true;
    });
  });

  contract('ShortSell', function(accounts) {
    it('replaces and refunds a higher bid if one exists', async () => {
      const bidder = accounts[6];
      const bidder2 = accounts[7];
      const bid = new BigNumber(200);
      const bid2 = new BigNumber(100);
      const { shortSell, vault, underlyingToken, shortTx } = await doShortAndCall(accounts);

      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);
      const tx = await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder2, bid2);

      console.log('\tShortSell.placeSellbackBid (with refund) gas used: ' + tx.receipt.gasUsed);

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
      expect(auctionOffer.offer.equals(bid2)).to.be.true;
      expect(auctionOffer.bidder.toLowerCase()).to.eq(bidder2.toLowerCase());
      expect(auctionOffer.exists).to.be.true;
      expect(vaultUnderlyingTokenBalance.equals(shortTx.shortAmount)).to.be.true;
      expect(tokenBalanceOfVault.equals(shortTx.shortAmount)).to.be.true;
      expect(bidderBalance.equals(shortTx.shortAmount)).to.be.true;
      expect(bidder2Balance.equals(new BigNumber(0))).to.be.true;
    });
  });
});
