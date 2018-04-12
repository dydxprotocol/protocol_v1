/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const { wait } = require('@digix/tempo')(web3);
const QuoteToken = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");
const TestForceRecoverDepositDelegator = artifacts.require("TestForceRecoverDepositDelegator");
const {
  doOpenPosition,
  doOpenPositionAndCall
} = require('../helpers/MarginHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { expectLog } = require('../helpers/EventHelper');

describe('#forceRecoverDeposit', () => {
  contract('Margin', function(accounts) {
    it('allows funds to be recovered by the lender', async () => {
      const { margin, vault, baseToken, openTx } = await doOpenPositionAndCall(accounts);
      await wait(openTx.loanOffering.callTimeLimit);

      const quoteTokenBalance = await margin.getPositionBalance.call(openTx.id);

      const tx = await margin.forceRecoverDeposit(
        openTx.id,
        { from: openTx.loanOffering.payer }
      );

      console.log('\tMargin.forceRecoverDeposit gas used: ' + tx.receipt.gasUsed);

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
        margin.containsPosition.call(openTx.id),
        margin.isPositionClosed.call(openTx.id),
        quoteToken.balanceOf.call(openTx.loanOffering.payer)
      ]);

      expect(vaultBaseTokenBalance).to.be.bignumber.equal(0);
      expect(baseTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultQuoteTokenBalance).to.be.bignumber.equal(0);
      expect(quoteTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(positionExists).to.be.false;
      expect(isPositionClosed).to.be.true;
      expect(lenderQuoteTokenBalance).to.be.bignumber.equal(quoteTokenBalance);

      expectLog(tx.logs[0], 'PositionCollateralRecovered', {
        marginId: openTx.id,
        amount: quoteTokenBalance
      });
    });
  });

  contract('Margin', function(accounts) {
    it('only allows lender to call', async () => {
      const { margin, openTx } = await doOpenPositionAndCall(accounts);
      await wait(openTx.loanOffering.callTimeLimit);

      await expectThrow( margin.forceRecoverDeposit(
        openTx.id,
        { from: accounts[7] }
      ));
    });
  });

  contract('Margin', function(accounts) {
    it('ForceRecoverDepositDelegator loan owner only allows certain accounts', async () => {
      const { margin, vault, baseToken, openTx } = await doOpenPositionAndCall(accounts);
      await wait(openTx.loanOffering.callTimeLimit);

      const quoteTokenBalance = await margin.getPositionBalance.call(openTx.id);

      const recoverer = accounts[9];
      const testForceRecoverDepositDelegator = await TestForceRecoverDepositDelegator.new(
        Margin.address,
        recoverer
      );
      await margin.transferAsLender(
        openTx.id,
        testForceRecoverDepositDelegator.address,
        { from: openTx.loanOffering.payer });

      await expectThrow( margin.forceRecoverDeposit(
        openTx.id,
        { from: accounts[6] }
      ));

      await margin.forceRecoverDeposit(
        openTx.id,
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
        margin.containsPosition.call(openTx.id),
        margin.isPositionClosed.call(openTx.id),
        quoteToken.balanceOf.call(testForceRecoverDepositDelegator.address)
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
      const { margin, openTx } = await doOpenPositionAndCall(accounts);
      await expectThrow( margin.forceRecoverDeposit(
        openTx.id,
        { from: openTx.loanOffering.payer }
      ));
    });
  });
  contract('Margin', function(accounts) {
    it('does not allow if not called or not reached maximumDuration+callTimeLimit', async () => {
      const margin = await Margin.deployed();
      const openTx = await doOpenPosition(accounts);

      const maxDuration = openTx.loanOffering.maxDuration;
      const almostMaxDuration = maxDuration - 100;
      const callTimeLimit = openTx.loanOffering.callTimeLimit;
      expect(almostMaxDuration).to.be.at.least(callTimeLimit);

      // loan was not called and it is too early
      await wait(almostMaxDuration);
      await expectThrow( margin.forceRecoverDeposit(
        openTx.id,
        { from: openTx.loanOffering.payer }
      ));

      // now it's okay because current time is past maxDuration+callTimeLimit
      await wait(callTimeLimit + 100);
      await margin.forceRecoverDeposit(
        openTx.id,
        { from: openTx.loanOffering.payer }
      );
    });
  });
});
