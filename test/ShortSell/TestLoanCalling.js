/*global artifacts, web3, contract, describe, it*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const { wait } = require('@digix/tempo')(web3);
const ShortSell = artifacts.require("ShortSell");
const {
  doShort,
  getShort
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

function getCallTimestamp(tx) {
  return tx.logs.find(
    l => l.event === 'LoanCalled'
  ).args.timestamp;
}

describe('#callInLoan', () => {
  contract('ShortSell', function(accounts) {
    it('sets callTimestamp on the short', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await wait(shortTx.loanOffering.lockoutTime);

      const tx = await shortSell.callInLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      console.log('\tShortSell.callInLoan gas used: ' + tx.receipt.gasUsed);

      const shortCalledTimestamp = getCallTimestamp(tx);

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp.equals(shortCalledTimestamp)).to.be.true;
    });
  });

  contract('ShortSell', function(accounts) {
    it('enforces the lender waits the lockoutTime before calling', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await expectThrow(() => shortSell.callInLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      ));

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp.equals(new BigNumber(0))).to.be.true;
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the lender to call', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await wait(shortTx.loanOffering.lockoutTime);

      await expectThrow(() => shortSell.callInLoan(
        shortTx.id,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp.equals(new BigNumber(0))).to.be.true;
    });
  });

  contract('ShortSell', function(accounts) {
    it('fails if the loan has already been called', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await wait(shortTx.loanOffering.lockoutTime);

      const tx = await shortSell.callInLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );

      await expectThrow(() => shortSell.callInLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      ));

      const shortCalledTimestamp = getCallTimestamp(tx);

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp.equals(shortCalledTimestamp)).to.be.true;
    });
  });
});

describe('#cancelLoanCall', () => {
  contract('ShortSell', function(accounts) {
    it('unsets callTimestamp on the short', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await wait(shortTx.loanOffering.lockoutTime);

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

      expect(callTimestamp.equals(new BigNumber(0))).to.be.true;
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the lender to call', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await wait(shortTx.loanOffering.lockoutTime);

      const tx = await shortSell.callInLoan(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      );
      const shortCalledTimestamp = getCallTimestamp(tx);

      await expectThrow( () => shortSell.cancelLoanCall(
        shortTx.id,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getShort(shortSell, shortTx.id);

      expect(callTimestamp.equals(shortCalledTimestamp)).to.be.true;
    });
  });

  contract('ShortSell', function(accounts) {
    it('fails if the loan has not been called', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);

      await wait(shortTx.loanOffering.lockoutTime);

      await expectThrow(() => shortSell.cancelLoanCall(
        shortTx.id,
        { from: shortTx.loanOffering.lender }
      ));
    });
  });

  // TODO test it sends auction bid tokens back
});
