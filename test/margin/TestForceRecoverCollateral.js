/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const { wait } = require('@digix/tempo')(web3);
const QuoteToken = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");
const TestForceRecoverCollateralDelegator =
  artifacts.require("TestForceRecoverCollateralDelegator");
const {
  doOpenPosition,
  doOpenPositionAndCall
} = require('../helpers/MarginHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { expectLog } = require('../helpers/EventHelper');

describe('#forceRecoverCollateral', () => {
  contract('Margin', function(accounts) {
    it('allows funds to be recovered by the lender', async () => {
      const { dydxMargin, vault, baseToken, OpenTx } = await doOpenPositionAndCall(accounts);
      await wait(OpenTx.loanOffering.callTimeLimit);

      const quoteTokenBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);

      const tx = await dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        { from: OpenTx.loanOffering.payer }
      );

      console.log('\tMargin.forceRecoverCollateral gas used: ' + tx.receipt.gasUsed);

      const quoteToken = await QuoteToken.deployed();

      const [
        vaultBaseTokenBalance,
        baseTokenBalanceOfVault,
        vaultQuoteTokenBalance,
        quoteTokenBalanceOfVault,
        positionExists,
        isPositionClosed,
        lenderQuoteTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(baseToken.address),
        baseToken.balanceOf.call(vault.address),
        vault.totalBalances.call(quoteToken.address),
        quoteToken.balanceOf.call(vault.address),
        dydxMargin.containsPosition.call(OpenTx.id),
        dydxMargin.isPositionClosed.call(OpenTx.id),
        quoteToken.balanceOf.call(OpenTx.loanOffering.payer)
      ]);

      expect(vaultBaseTokenBalance).to.be.bignumber.equal(0);
      expect(baseTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultQuoteTokenBalance).to.be.bignumber.equal(0);
      expect(quoteTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(positionExists).to.be.false;
      expect(isPositionClosed).to.be.true;
      expect(lenderQuoteTokenBalance).to.be.bignumber.equal(quoteTokenBalance);

      expectLog(tx.logs[0], 'CollateralForceRecovered', {
        positionId: OpenTx.id,
        amount: quoteTokenBalance
      });
    });
  });

  contract('Margin', function(accounts) {
    it('only allows lender to call', async () => {
      const { dydxMargin, OpenTx } = await doOpenPositionAndCall(accounts);
      await wait(OpenTx.loanOffering.callTimeLimit);

      await expectThrow(dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        { from: accounts[7] }
      ));
    });
  });

  contract('Margin', function(accounts) {
    it('ForceRecoverCollateralDelegator loan owner only allows certain accounts', async () => {
      const { dydxMargin, vault, baseToken, OpenTx } = await doOpenPositionAndCall(accounts);
      await wait(OpenTx.loanOffering.callTimeLimit);

      const quoteTokenBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);

      const recoverer = accounts[9];
      const testForceRecoverCollateralDelegator = await TestForceRecoverCollateralDelegator.new(
        Margin.address,
        recoverer
      );
      await dydxMargin.transferLoan(
        OpenTx.id,
        testForceRecoverCollateralDelegator.address,
        { from: OpenTx.loanOffering.payer });

      await expectThrow(dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        { from: accounts[6] }
      ));

      await dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        { from: recoverer }
      );

      const quoteToken = await QuoteToken.deployed();

      const [
        vaultBaseTokenBalance,
        baseTokenBalanceOfVault,
        vaultQuoteTokenBalance,
        quoteTokenBalanceOfVault,
        positionExists,
        isPositionClosed,
        lenderQuoteTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(baseToken.address),
        baseToken.balanceOf.call(vault.address),
        vault.totalBalances.call(quoteToken.address),
        quoteToken.balanceOf.call(vault.address),
        dydxMargin.containsPosition.call(OpenTx.id),
        dydxMargin.isPositionClosed.call(OpenTx.id),
        quoteToken.balanceOf.call(testForceRecoverCollateralDelegator.address)
      ]);

      expect(vaultBaseTokenBalance).to.be.bignumber.equal(0);
      expect(baseTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultQuoteTokenBalance).to.be.bignumber.equal(0);
      expect(quoteTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(positionExists).to.be.false;
      expect(isPositionClosed).to.be.true;
      expect(lenderQuoteTokenBalance).to.be.bignumber.equal(quoteTokenBalance);
    });
  });

  contract('Margin', function(accounts) {
    it('does not allow before call time limit elapsed', async () => {
      const { dydxMargin, OpenTx } = await doOpenPositionAndCall(accounts);
      await expectThrow(dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        { from: OpenTx.loanOffering.payer }
      ));
    });
  });
  contract('Margin', function(accounts) {
    it('does not allow if not called or not reached maximumDuration+callTimeLimit', async () => {
      const dydxMargin = await Margin.deployed();
      const OpenTx = await doOpenPosition(accounts);

      const maxDuration = OpenTx.loanOffering.maxDuration;
      const almostMaxDuration = maxDuration - 100;
      const callTimeLimit = OpenTx.loanOffering.callTimeLimit;
      expect(almostMaxDuration).to.be.at.least(callTimeLimit);

      // loan was not called and it is too early
      await wait(almostMaxDuration);
      await expectThrow(dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        { from: OpenTx.loanOffering.payer }
      ));

      // now it's okay because current time is past maxDuration+callTimeLimit
      await wait(callTimeLimit + 100);
      await dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        { from: OpenTx.loanOffering.payer }
      );
    });
  });
});
