/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const TestCallLoanDelegator = artifacts.require("TestCallLoanDelegator");
const {
  doShort,
  getShort,
  doShortAndCall
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { getBlockTimestamp } = require('../helpers/NodeHelper');
const { ADDRESSES } = require('../helpers/Constants');

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
    it('prevents unauthorized accounts from calling', async () => {
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
    it('CallLoanDelegator loan owner only allows certain accounts', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await doShort(accounts);
      const caller = accounts[8];
      const loanCaller = await TestCallLoanDelegator.new(
        ShortSell.address,
        caller,
        ADDRESSES.ZERO);
      await shortSell.transferLoan(
        shortTx.id,
        loanCaller.address,
        { from: shortTx.loanOffering.lender }
      );
      let short = await getShort(shortSell, shortTx.id);
      expect(short.callTimestamp).to.be.bignumber.equal(0);

      await expectThrow(() => shortSell.callInLoan(
        shortTx.id,
        REQUIRED_DEPOSIT,
        { from: accounts[6] }
      ));
      short = await getShort(shortSell, shortTx.id);
      expect(short.callTimestamp).to.be.bignumber.equal(0);

      await shortSell.callInLoan(
        shortTx.id,
        REQUIRED_DEPOSIT,
        { from: caller }
      );
      short = await getShort(shortSell, shortTx.id);
      expect(short.callTimestamp).to.be.bignumber.not.equal(0);
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
    it('prevents unauthorized accounts from cancelling', async () => {
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
    it('CallLoanDelegator loan owner only allows certain accounts', async () => {
      const shortSell = await ShortSell.deployed();
      const { shortTx } = await doShortAndCall(accounts);
      const canceller = accounts[9];
      const loanCaller = await TestCallLoanDelegator.new(
        ShortSell.address,
        ADDRESSES.ZERO,
        canceller);
      await shortSell.transferLoan(
        shortTx.id,
        loanCaller.address,
        { from: shortTx.loanOffering.lender }
      );
      let short = await getShort(shortSell, shortTx.id);
      expect(short.callTimestamp).to.be.bignumber.not.equal(0);

      await expectThrow(() => shortSell.cancelLoanCall(
        shortTx.id,
        { from: accounts[6] }
      ));
      short = await getShort(shortSell, shortTx.id);
      expect(short.callTimestamp).to.be.bignumber.not.equal(0);

      await shortSell.cancelLoanCall(
        shortTx.id,
        { from: canceller }
      );
      short = await getShort(shortSell, shortTx.id);
      expect(short.callTimestamp).to.be.bignumber.equal(0);
    });
  });
});
