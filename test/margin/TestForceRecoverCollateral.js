/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const { wait } = require('@digix/tempo')(web3);
const HeldToken = artifacts.require("TokenA");
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
      const { dydxMargin, vault, owedToken, OpenTx } = await doOpenPositionAndCall(accounts);
      await wait(OpenTx.loanOffering.callTimeLimit);

      const heldTokenBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);

      const tx = await dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        { from: OpenTx.loanOffering.payer }
      );

      console.log('\tMargin.forceRecoverCollateral gas used: ' + tx.receipt.gasUsed);

      const heldToken = await HeldToken.deployed();

      const [
        vaultOwedTokenBalance,
        owedTokenBalanceOfVault,
        vaultHeldTokenBalance,
        heldTokenBalanceOfVault,
        positionExists,
        isPositionClosed,
        lenderHeldTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(owedToken.address),
        owedToken.balanceOf.call(vault.address),
        vault.totalBalances.call(heldToken.address),
        heldToken.balanceOf.call(vault.address),
        dydxMargin.containsPosition.call(OpenTx.id),
        dydxMargin.isPositionClosed.call(OpenTx.id),
        heldToken.balanceOf.call(OpenTx.loanOffering.payer)
      ]);

      expect(vaultOwedTokenBalance).to.be.bignumber.equal(0);
      expect(owedTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultHeldTokenBalance).to.be.bignumber.equal(0);
      expect(heldTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(positionExists).to.be.false;
      expect(isPositionClosed).to.be.true;
      expect(lenderHeldTokenBalance).to.be.bignumber.equal(heldTokenBalance);

      expectLog(tx.logs[0], 'CollateralForceRecovered', {
        positionId: OpenTx.id,
        amount: heldTokenBalance
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
      const { dydxMargin, vault, owedToken, OpenTx } = await doOpenPositionAndCall(accounts);
      await wait(OpenTx.loanOffering.callTimeLimit);

      const heldTokenBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);

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

      const heldToken = await HeldToken.deployed();

      const [
        vaultOwedTokenBalance,
        owedTokenBalanceOfVault,
        vaultHeldTokenBalance,
        heldTokenBalanceOfVault,
        positionExists,
        isPositionClosed,
        lenderHeldTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(owedToken.address),
        owedToken.balanceOf.call(vault.address),
        vault.totalBalances.call(heldToken.address),
        heldToken.balanceOf.call(vault.address),
        dydxMargin.containsPosition.call(OpenTx.id),
        dydxMargin.isPositionClosed.call(OpenTx.id),
        heldToken.balanceOf.call(testForceRecoverCollateralDelegator.address)
      ]);

      expect(vaultOwedTokenBalance).to.be.bignumber.equal(0);
      expect(owedTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultHeldTokenBalance).to.be.bignumber.equal(0);
      expect(heldTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(positionExists).to.be.false;
      expect(isPositionClosed).to.be.true;
      expect(lenderHeldTokenBalance).to.be.bignumber.equal(heldTokenBalance);
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
