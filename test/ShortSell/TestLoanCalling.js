/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const {
  doShort,
  getShort,
  doShortAndCall
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { getBlockTimestamp } = require('../helpers/NodeHelper');

function getCallTimestamp(tx) {
  return getBlockTimestamp(tx.receipt.blockNumber)
}

describe('#callInLoan', () => {
  const REQUIRED_DEPOSIT = new BigNumber(10);
  contract('ShortSell', function(accounts) {
    it('sets callTimestamp and requiredDeposit on the short', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      const tx = await shortSell.callInLoan(
        shortTx.id,
        REQUIRED_DEPOSIT,
        { from: shortTx.loanOffering.lender }
      );

      console.log('\tShortSell.callInLoan gas used: ' + tx.receipt.gasUsed);

      const shortCalledTimestamp = await getCallTimestamp(tx);

      const {
        callTimestamp,
        requiredDeposit
      } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp).to.be.bignumber.equal(shortCalledTimestamp);
      expect(requiredDeposit).to.be.bignumber.equal(REQUIRED_DEPOSIT);
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the lender to call', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await expectThrow(() => shortSell.callInLoan(
        shortTx.id,
        REQUIRED_DEPOSIT,
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
        REQUIRED_DEPOSIT,
        { from: shortTx.loanOffering.lender }
      );

      await expectThrow(() => shortSell.callInLoan(
        shortTx.id,
        REQUIRED_DEPOSIT.plus(REQUIRED_DEPOSIT),
        { from: shortTx.loanOffering.lender }
      ));

      const shortCalledTimestamp = await getCallTimestamp(tx);

      const {
        callTimestamp,
        requiredDeposit
      } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp).to.be.bignumber.equal(shortCalledTimestamp);
      expect(requiredDeposit).to.be.bignumber.equal(REQUIRED_DEPOSIT);
    });
  });
});

describe('#cancelLoanCall', () => {
  contract('ShortSell', function(accounts) {
    it('unsets callTimestamp and requiredDeposit on the short', async () => {
      const shortSell = await ShortSell.deployed();
      const { shortTx } = await doShortAndCall(accounts);

      const tx = await shortSell.cancelLoanCall(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      console.log('\tShortSell.cancelLoanCall gas used: ' + tx.receipt.gasUsed);

      const {
        callTimestamp,
        requiredDeposit
      } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp).to.be.bignumber.equal(0);
      expect(requiredDeposit).to.be.bignumber.equal(0);
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the lender to call', async () => {
      const shortSell = await ShortSell.deployed();
      const { shortTx, callTx } = await doShortAndCall(accounts);

      const shortCalledTimestamp = await getCallTimestamp(callTx);

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
      const { shortSell, vault, underlyingToken, shortTx } = await doShortAndCall(accounts);

      await shortSell.cancelLoanCall(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      const [
        vaultUnderlyingTokenBalance,
        tokenBalanceOfVault,
      ] = await Promise.all([
        vault.totalBalances.call(underlyingToken.address),
        underlyingToken.balanceOf.call(vault.address)
      ]);

      expect(callTimestamp).to.be.bignumber.equal(0);
      expect(vaultUnderlyingTokenBalance).to.be.bignumber.equal(0);
      expect(tokenBalanceOfVault).to.be.bignumber.equal(0);
    });
  });
});
