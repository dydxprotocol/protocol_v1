const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const { wait } = require('@digix/tempo')(web3);
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const Margin = artifacts.require("Margin");
const Vault = artifacts.require("Vault");
const TestForceRecoverCollateralDelegator =
  artifacts.require("TestForceRecoverCollateralDelegator");
const {
  doOpenPosition,
  doOpenPositionAndCall
} = require('../../helpers/MarginHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');
const { expectLog } = require('../../helpers/EventHelper');
const { ADDRESSES } = require('../../helpers/Constants');

describe('#forceRecoverCollateral', () => {
  contract('Margin', accounts => {
    it('allows funds to be recovered by the lender', async () => {
      const [vault, owedToken, heldToken] = await Promise.all([
        Vault.deployed(),
        OwedToken.deployed(),
        HeldToken.deployed(),
      ]);

      const [
        startingVaultOwedTokenBalance,
        startingVwedTokenBalanceOfVault,
        startingVaultHeldTokenBalance,
        startingHeldTokenBalanceOfVault,
      ] = await Promise.all([
        vault.totalBalances.call(OwedToken.address),
        owedToken.balanceOf.call(Vault.address),
        vault.totalBalances.call(HeldToken.address),
        heldToken.balanceOf.call(Vault.address),
      ]);

      const { dydxMargin, openTx } = await doOpenPositionAndCall(accounts);
      await wait(openTx.loanOffering.callTimeLimit);

      const heldTokenBalance = await dydxMargin.getPositionBalance.call(openTx.id);
      const recipient = accounts[9];

      const tx = await dydxMargin.forceRecoverCollateral(
        openTx.id,
        recipient,
        { from: openTx.loanOffering.owner }
      );

      console.log('\tMargin.forceRecoverCollateral gas used: ' + tx.receipt.gasUsed);

      const [
        vaultOwedTokenBalance,
        owedTokenBalanceOfVault,
        vaultHeldTokenBalance,
        heldTokenBalanceOfVault,
        positionExists,
        isPositionClosed,
        recipientHeldTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(owedToken.address),
        owedToken.balanceOf.call(vault.address),
        vault.totalBalances.call(heldToken.address),
        heldToken.balanceOf.call(vault.address),
        dydxMargin.containsPosition.call(openTx.id),
        dydxMargin.isPositionClosed.call(openTx.id),
        heldToken.balanceOf.call(recipient)
      ]);

      expect(vaultOwedTokenBalance).to.be.bignumber.equal(startingVaultOwedTokenBalance);
      expect(owedTokenBalanceOfVault).to.be.bignumber.equal(startingVwedTokenBalanceOfVault);
      expect(vaultHeldTokenBalance).to.be.bignumber.equal(startingVaultHeldTokenBalance);
      expect(heldTokenBalanceOfVault).to.be.bignumber.equal(startingHeldTokenBalanceOfVault);
      expect(positionExists).to.be.false;
      expect(isPositionClosed).to.be.true;
      expect(recipientHeldTokenBalance).to.be.bignumber.equal(heldTokenBalance);

      expectLog(tx.logs[0], 'CollateralForceRecovered', {
        positionId: openTx.id,
        recipient: recipient,
        amount: heldTokenBalance
      });
    });
  });

  contract('Margin', accounts => {
    it('only allows lender to call', async () => {
      const { dydxMargin, openTx } = await doOpenPositionAndCall(accounts);
      await wait(openTx.loanOffering.callTimeLimit);

      await expectThrow(dydxMargin.forceRecoverCollateral(
        openTx.id,
        openTx.loanOffering.owner,
        { from: accounts[7] }
      ));
    });
  });

  contract('Margin', accounts => {
    let salt = 9999;

    async function testFRCD(recoverer, recipient) {
      const [vault, owedToken, heldToken] = await Promise.all([
        Vault.deployed(),
        OwedToken.deployed(),
        HeldToken.deployed(),
      ]);

      const [
        startingVaultOwedTokenBalance,
        startingVwedTokenBalanceOfVault,
        startingVaultHeldTokenBalance,
        startingHeldTokenBalanceOfVault,
      ] = await Promise.all([
        vault.totalBalances.call(OwedToken.address),
        owedToken.balanceOf.call(Vault.address),
        vault.totalBalances.call(HeldToken.address),
        heldToken.balanceOf.call(Vault.address),
      ]);

      const { dydxMargin, openTx } =
        await doOpenPositionAndCall(accounts, { salt: salt++ });

      await wait(openTx.loanOffering.callTimeLimit);

      const heldTokenBalance = await dydxMargin.getPositionBalance.call(openTx.id);

      const badRecoverer = accounts[6];
      const badRecipient = accounts[7];
      expect(badRecoverer).to.not.equal(recoverer);
      expect(badRecipient).to.not.equal(recipient);

      // FRCD that allows only a certain recipient
      const testFRCD = await TestForceRecoverCollateralDelegator.new(
        Margin.address,
        recoverer,
        recipient
      );

      // Transfer loans to testFRCDs
      await dydxMargin.transferLoan(
        openTx.id,
        testFRCD.address,
        { from: openTx.loanOffering.owner }
      );

      // Throw for random accounts
      await expectThrow(dydxMargin.forceRecoverCollateral(
        openTx.id,
        badRecipient,
        { from: badRecoverer }
      ));

      let finalRecipient, finalRecoverer;
      if (recoverer !== ADDRESSES.ZERO) {
        finalRecipient = badRecipient;
        finalRecoverer = recoverer;
      } else if (recipient !== ADDRESSES.ZERO) {
        finalRecipient = recipient;
        finalRecoverer = badRecoverer;
      }
      await dydxMargin.forceRecoverCollateral(
        openTx.id,
        finalRecipient,
        { from: finalRecoverer }
      );

      const [
        vaultOwedTokenBalance,
        owedTokenBalanceOfVault,
        vaultHeldTokenBalance,
        heldTokenBalanceOfVault,
        positionExists,
        isPositionClosed,
        frcdHeldTokenBalance,
      ] = await Promise.all([
        vault.totalBalances.call(owedToken.address),
        owedToken.balanceOf.call(vault.address),
        vault.totalBalances.call(heldToken.address),
        heldToken.balanceOf.call(vault.address),
        dydxMargin.containsPosition.call(openTx.id),
        dydxMargin.isPositionClosed.call(openTx.id),
        heldToken.balanceOf.call(finalRecipient),
      ]);

      expect(vaultOwedTokenBalance).to.be.bignumber.equal(startingVaultOwedTokenBalance);
      expect(owedTokenBalanceOfVault).to.be.bignumber.equal(startingVwedTokenBalanceOfVault);
      expect(vaultHeldTokenBalance).to.be.bignumber.equal(startingVaultHeldTokenBalance);
      expect(heldTokenBalanceOfVault).to.be.bignumber.equal(startingHeldTokenBalanceOfVault);
      expect(positionExists).to.be.false;
      expect(isPositionClosed).to.be.true;
      expect(frcdHeldTokenBalance).to.be.bignumber.equal(heldTokenBalance);
    }

    it('ForceRecoverCollateralDelegator loan owner only allows certain accounts', async () => {
      await testFRCD(accounts[8], ADDRESSES.ZERO);
      await testFRCD(ADDRESSES.ZERO, accounts[9]);
    });
  });

  contract('Margin', accounts => {
    it('does not allow before call time limit elapsed', async () => {
      const { dydxMargin, openTx } = await doOpenPositionAndCall(accounts);
      await expectThrow(dydxMargin.forceRecoverCollateral(
        openTx.id,
        openTx.loanOffering.owner,
        { from: openTx.loanOffering.owner }
      ));
    });
  });
  contract('Margin', accounts => {
    it('does not allow if not called or not reached maximumDuration+callTimeLimit', async () => {
      const dydxMargin = await Margin.deployed();
      const openTx = await doOpenPosition(accounts);

      const maxDuration = openTx.loanOffering.maxDuration;
      const almostMaxDuration = maxDuration - 100;
      const callTimeLimit = openTx.loanOffering.callTimeLimit;
      expect(almostMaxDuration).to.be.at.least(callTimeLimit);

      // loan was not called and it is too early
      await wait(almostMaxDuration);
      await expectThrow(dydxMargin.forceRecoverCollateral(
        openTx.id,
        openTx.loanOffering.owner,
        { from: openTx.loanOffering.owner}
      ));

      // now it's okay because current time is past maxDuration+callTimeLimit
      await wait(callTimeLimit + 100);
      await dydxMargin.forceRecoverCollateral(
        openTx.id,
        openTx.loanOffering.owner,
        { from: openTx.loanOffering.owner }
      );
    });
  });
});
