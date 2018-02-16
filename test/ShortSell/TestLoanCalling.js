/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const { wait } = require('@digix/tempo')(web3);
const ShortSell = artifacts.require("ShortSell");
const {
  doShort,
  getShort,
  doShortAndCall,
  placeAuctionBid
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { getBlockTimestamp } = require('../helpers/NodeHelper');

function getCallTimestamp(tx) {
  return getBlockTimestamp(tx.receipt.blockNumber)
}

describe('#callInLoan', () => {
  contract('ShortSell', function(accounts) {
    it('sets callTimestamp on the short', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      const tx = await shortSell.callInLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      console.log('\tShortSell.callInLoan gas used: ' + tx.receipt.gasUsed);

      const shortCalledTimestamp = await getCallTimestamp(tx);

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp).to.be.bignumber.equal(shortCalledTimestamp);
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the lender to call', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await expectThrow(() => shortSell.callInLoan(
        shortTx.id,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp).to.be.bignumber.equal(0);
    });
  });

  contract('ShortSell', function(accounts) {
    it('fails if the loan has already been called', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      const tx = await shortSell.callInLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      await expectThrow(() => shortSell.callInLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      ));

      const shortCalledTimestamp = await getCallTimestamp(tx);

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp).to.be.bignumber.equal(shortCalledTimestamp);
    });
  });
});

describe('#cancelLoanCall', () => {
  contract('ShortSell', function(accounts) {
    it('unsets callTimestamp on the short', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await shortSell.callInLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      const tx = await shortSell.cancelLoanCall(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      console.log('\tShortSell.cancelLoanCall gas used: ' + tx.receipt.gasUsed);

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp).to.be.bignumber.equal(0);
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the lender to call', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      const tx = await shortSell.callInLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );
      const shortCalledTimestamp = await getCallTimestamp(tx);

      await expectThrow( () => shortSell.cancelLoanCall(
        shortTx.id,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp).to.be.bignumber.equal(shortCalledTimestamp);
    });
  });

  contract('ShortSell', function(accounts) {
    it('fails if the loan has not been called', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await expectThrow(() => shortSell.cancelLoanCall(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      ));
    });
  });

  contract('ShortSell', function(accounts) {
    it('unsets callTimestamp on the short', async () => {
      const bidder = accounts[6];
      const bid = new BigNumber(100);
      const { shortSell, vault, underlyingToken, shortTx } = await doShortAndCall(accounts);
      await placeAuctionBid(shortSell, underlyingToken, shortTx, bidder, bid);

      await shortSell.cancelLoanCall(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      const [
        auctionExists,
        vaultUnderlyingTokenBalance,
        tokenBalanceOfVault,
        bidderTokenBalance
      ] = await Promise.all([
        shortSell.hasShortAuctionOffer.call(shortTx.id),
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address),
        underlyingToken.balanceOf.call(bidder),
      ]);

      expect(callTimestamp).to.be.bignumber.equal(0);
      expect(auctionExists).to.be.false;
      expect(vaultUnderlyingTokenBalance).to.be.bignumber.equal(0);
      expect(tokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(bidderTokenBalance).to.be.bignumber.equal(shortTx.shortAmount);
    });
  });
});
