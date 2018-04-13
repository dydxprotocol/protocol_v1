/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const { wait } = require('@digix/tempo')(web3);
const QuoteToken = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");
const TestForceRecoverLoanDelegator = artifacts.require("TestForceRecoverLoanDelegator");
const {
  doShort,
  doShortAndCall
} = require('../helpers/MarginHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { expectLog } = require('../helpers/EventHelper');

describe('#forceRecoverLoan', () => {
  contract('Margin', function(accounts) {
    it('allows funds to be recovered by the lender', async () => {
      const { dydxMargin, vault, baseToken, shortTx } = await doShortAndCall(accounts);
      await wait(shortTx.loanOffering.callTimeLimit);

      const quoteTokenBalance = await dydxMargin.getShortBalance.call(shortTx.id);

      const tx = await dydxMargin.forceRecoverLoan(
        shortTx.id,
        { from: shortTx.loanOffering.payer }
      );

      console.log('\tMargin.forceRecoverLoan gas used: ' + tx.receipt.gasUsed);

      const quoteToken = await QuoteToken.deployed();

      const [
        vaultBaseTokenBalance,
        baseTokenBalanceOfVault,
        vaultQuoteTokenBalance,
        quoteTokenBalanceOfVault,
        shortExists,
        isShortClosed,
        lenderQuoteTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(baseToken.address),
        baseToken.balanceOf.call(vault.address),
        vault.totalBalances.call(quoteToken.address),
        quoteToken.balanceOf.call(vault.address),
        dydxMargin.containsShort.call(shortTx.id),
        dydxMargin.isShortClosed.call(shortTx.id),
        quoteToken.balanceOf.call(shortTx.loanOffering.payer)
      ]);

      expect(vaultBaseTokenBalance).to.be.bignumber.equal(0);
      expect(baseTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultQuoteTokenBalance).to.be.bignumber.equal(0);
      expect(quoteTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(shortExists).to.be.false;
      expect(isShortClosed).to.be.true;
      expect(lenderQuoteTokenBalance).to.be.bignumber.equal(quoteTokenBalance);

      expectLog(tx.logs[0], 'LoanForceRecovered', {
        shortId: shortTx.id,
        amount: quoteTokenBalance
      });
    });
  });

  contract('Margin', function(accounts) {
    it('only allows lender to call', async () => {
      const { dydxMargin, shortTx } = await doShortAndCall(accounts);
      await wait(shortTx.loanOffering.callTimeLimit);

      await expectThrow( dydxMargin.forceRecoverLoan(
        shortTx.id,
        { from: accounts[7] }
      ));
    });
  });

  contract('Margin', function(accounts) {
    it('ForceRecoverLoanDelegator loan owner only allows certain accounts', async () => {
      const { dydxMargin, vault, baseToken, shortTx } = await doShortAndCall(accounts);
      await wait(shortTx.loanOffering.callTimeLimit);

      const quoteTokenBalance = await dydxMargin.getShortBalance.call(shortTx.id);

      const recoverer = accounts[9];
      const testForceRecoverLoanDelegator = await TestForceRecoverLoanDelegator.new(
        Margin.address,
        recoverer
      );
      await dydxMargin.transferLoan(
        shortTx.id,
        testForceRecoverLoanDelegator.address,
        { from: shortTx.loanOffering.payer });

      await expectThrow( dydxMargin.forceRecoverLoan(
        shortTx.id,
        { from: accounts[6] }
      ));

      await dydxMargin.forceRecoverLoan(
        shortTx.id,
        { from: recoverer }
      );

      const quoteToken = await QuoteToken.deployed();

      const [
        vaultBaseTokenBalance,
        baseTokenBalanceOfVault,
        vaultQuoteTokenBalance,
        quoteTokenBalanceOfVault,
        shortExists,
        isShortClosed,
        lenderQuoteTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(baseToken.address),
        baseToken.balanceOf.call(vault.address),
        vault.totalBalances.call(quoteToken.address),
        quoteToken.balanceOf.call(vault.address),
        dydxMargin.containsShort.call(shortTx.id),
        dydxMargin.isShortClosed.call(shortTx.id),
        quoteToken.balanceOf.call(testForceRecoverLoanDelegator.address)
      ]);

      expect(vaultBaseTokenBalance).to.be.bignumber.equal(0);
      expect(baseTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultQuoteTokenBalance).to.be.bignumber.equal(0);
      expect(quoteTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(shortExists).to.be.false;
      expect(isShortClosed).to.be.true;
      expect(lenderQuoteTokenBalance).to.be.bignumber.equal(quoteTokenBalance);
    });
  });

  contract('Margin', function(accounts) {
    it('does not allow before call time limit elapsed', async () => {
      const { dydxMargin, shortTx } = await doShortAndCall(accounts);
      await expectThrow( dydxMargin.forceRecoverLoan(
        shortTx.id,
        { from: shortTx.loanOffering.payer }
      ));
    });
  });
  contract('Margin', function(accounts) {
    it('does not allow if not called or not reached maximumDuration+callTimeLimit', async () => {
      const dydxMargin = await Margin.deployed();
      const shortTx = await doShort(accounts);

      const maxDuration = shortTx.loanOffering.maxDuration;
      const almostMaxDuration = maxDuration - 100;
      const callTimeLimit = shortTx.loanOffering.callTimeLimit;
      expect(almostMaxDuration).to.be.at.least(callTimeLimit);

      // loan was not called and it is too early
      await wait(almostMaxDuration);
      await expectThrow( dydxMargin.forceRecoverLoan(
        shortTx.id,
        { from: shortTx.loanOffering.payer }
      ));

      // now it's okay because current time is past maxDuration+callTimeLimit
      await wait(callTimeLimit + 100);
      await dydxMargin.forceRecoverLoan(
        shortTx.id,
        { from: shortTx.loanOffering.payer }
      );
    });
  });
});
