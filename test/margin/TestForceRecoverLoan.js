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
      const { margin, vault, baseToken, OpenPositionTx } = await doOpenPositionAndCall(accounts);
      await wait(OpenPositionTx.loanOffering.callTimeLimit);

      const quoteTokenBalance = await margin.getPositionBalance.call(OpenPositionTx.id);

      const tx = await margin.forceRecoverDeposit(
        OpenPositionTx.id,
        { from: OpenPositionTx.loanOffering.payer }
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
        margin.containsPosition.call(OpenPositionTx.id),
        margin.isPositionClosed.call(OpenPositionTx.id),
        quoteToken.balanceOf.call(OpenPositionTx.loanOffering.payer)
      ]);

      expect(vaultBaseTokenBalance).to.be.bignumber.equal(0);
      expect(baseTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultQuoteTokenBalance).to.be.bignumber.equal(0);
      expect(quoteTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(positionExists).to.be.false;
      expect(isPositionClosed).to.be.true;
      expect(lenderQuoteTokenBalance).to.be.bignumber.equal(quoteTokenBalance);

      expectLog(tx.logs[0], 'PositionCollateralRecovered', {
        marginId: OpenPositionTx.id,
        amount: quoteTokenBalance
      });
    });
  });

  contract('Margin', function(accounts) {
    it('only allows lender to call', async () => {
      const { margin, OpenPositionTx } = await doOpenPositionAndCall(accounts);
      await wait(OpenPositionTx.loanOffering.callTimeLimit);

      await expectThrow( margin.forceRecoverDeposit(
        OpenPositionTx.id,
        { from: accounts[7] }
      ));
    });
  });

  contract('Margin', function(accounts) {
    it('ForceRecoverDepositDelegator loan owner only allows certain accounts', async () => {
      const { margin, vault, baseToken, OpenPositionTx } = await doOpenPositionAndCall(accounts);
      await wait(OpenPositionTx.loanOffering.callTimeLimit);

      const quoteTokenBalance = await margin.getPositionBalance.call(OpenPositionTx.id);

      const recoverer = accounts[9];
      const testForceRecoverDepositDelegator = await TestForceRecoverDepositDelegator.new(
        Margin.address,
        recoverer
      );
      await margin.transferLoan(
        OpenPositionTx.id,
        testForceRecoverDepositDelegator.address,
        { from: OpenPositionTx.loanOffering.payer });

      await expectThrow( margin.forceRecoverDeposit(
        OpenPositionTx.id,
        { from: accounts[6] }
      ));

      await margin.forceRecoverDeposit(
        OpenPositionTx.id,
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
        margin.containsPosition.call(OpenPositionTx.id),
        margin.isPositionClosed.call(OpenPositionTx.id),
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
      const { margin, OpenPositionTx } = await doOpenPositionAndCall(accounts);
      await expectThrow( margin.forceRecoverDeposit(
        OpenPositionTx.id,
        { from: OpenPositionTx.loanOffering.payer }
      ));
    });
  });
  contract('Margin', function(accounts) {
    it('does not allow if not called or not reached maximumDuration+callTimeLimit', async () => {
      const margin = await Margin.deployed();
      const OpenPositionTx = await doOpenPosition(accounts);

      const maxDuration = OpenPositionTx.loanOffering.maxDuration;
      const almostMaxDuration = maxDuration - 100;
      const callTimeLimit = OpenPositionTx.loanOffering.callTimeLimit;
      expect(almostMaxDuration).to.be.at.least(callTimeLimit);

      // loan was not called and it is too early
      await wait(almostMaxDuration);
      await expectThrow( margin.forceRecoverDeposit(
        OpenPositionTx.id,
        { from: OpenPositionTx.loanOffering.payer }
      ));

      // now it's okay because current time is past maxDuration+callTimeLimit
      await wait(callTimeLimit + 100);
      await margin.forceRecoverDeposit(
        OpenPositionTx.id,
        { from: OpenPositionTx.loanOffering.payer }
      );
    });
  });
});
