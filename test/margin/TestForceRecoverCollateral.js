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
const { ADDRESSES } = require('../helpers/Constants');

describe('#forceRecoverCollateral', () => {
  contract('Margin', accounts => {
    it('allows funds to be recovered by the lender', async () => {
      const { dydxMargin, vault, owedToken, OpenTx } = await doOpenPositionAndCall(accounts);
      await wait(OpenTx.loanOffering.callTimeLimit);

      const heldTokenBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);
      const recipient = accounts[9];

      const tx = await dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        recipient,
        { from: OpenTx.loanOffering.owner }
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
        recipientHeldTokenBalance
      ] = await Promise.all([
        vault.totalBalances.call(owedToken.address),
        owedToken.balanceOf.call(vault.address),
        vault.totalBalances.call(heldToken.address),
        heldToken.balanceOf.call(vault.address),
        dydxMargin.containsPosition.call(OpenTx.id),
        dydxMargin.isPositionClosed.call(OpenTx.id),
        heldToken.balanceOf.call(recipient)
      ]);

      expect(vaultOwedTokenBalance).to.be.bignumber.equal(0);
      expect(owedTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultHeldTokenBalance).to.be.bignumber.equal(0);
      expect(heldTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(positionExists).to.be.false;
      expect(isPositionClosed).to.be.true;
      expect(recipientHeldTokenBalance).to.be.bignumber.equal(heldTokenBalance);

      expectLog(tx.logs[0], 'CollateralForceRecovered', {
        positionId: OpenTx.id,
        recipient: recipient,
        amount: heldTokenBalance
      });
    });
  });

  contract('Margin', accounts => {
    it('only allows lender to call', async () => {
      const { dydxMargin, OpenTx } = await doOpenPositionAndCall(accounts);
      await wait(OpenTx.loanOffering.callTimeLimit);

      await expectThrow(dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        OpenTx.loanOffering.owner,
        { from: accounts[7] }
      ));
    });
  });

  contract('Margin', accounts => {
    let salt = 9999;

    async function testFRCD(recoverer, recipient) {
      const { dydxMargin, vault, owedToken, OpenTx } =
        await doOpenPositionAndCall(accounts, { salt: salt++ });

      await wait(OpenTx.loanOffering.callTimeLimit);

      const heldTokenBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);

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
        OpenTx.id,
        testFRCD.address,
        { from: OpenTx.loanOffering.owner }
      );

      // Throw for random accounts
      await expectThrow(dydxMargin.forceRecoverCollateral(
        OpenTx.id,
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
        OpenTx.id,
        finalRecipient,
        { from: finalRecoverer }
      );

      const heldToken = await HeldToken.deployed();

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
        dydxMargin.containsPosition.call(OpenTx.id),
        dydxMargin.isPositionClosed.call(OpenTx.id),
        heldToken.balanceOf.call(finalRecipient),
      ]);

      expect(vaultOwedTokenBalance).to.be.bignumber.equal(0);
      expect(owedTokenBalanceOfVault).to.be.bignumber.equal(0);
      expect(vaultHeldTokenBalance).to.be.bignumber.equal(0);
      expect(heldTokenBalanceOfVault).to.be.bignumber.equal(0);
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
      const { dydxMargin, OpenTx } = await doOpenPositionAndCall(accounts);
      await expectThrow(dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        OpenTx.loanOffering.owner,
        { from: OpenTx.loanOffering.owner }
      ));
    });
  });
  contract('Margin', accounts => {
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
        OpenTx.loanOffering.owner,
        { from: OpenTx.loanOffering.owner}
      ));

      // now it's okay because current time is past maxDuration+callTimeLimit
      await wait(callTimeLimit + 100);
      await dydxMargin.forceRecoverCollateral(
        OpenTx.id,
        OpenTx.loanOffering.owner,
        { from: OpenTx.loanOffering.owner }
      );
    });
  });
});
