/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const TestCallLoanDelegator = artifacts.require("TestCallLoanDelegator");
const {
  doShort,
  getShort,
  doShortAndCall
} = require('../helpers/MarginHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { expectLog } = require('../helpers/EventHelper');
const { getBlockTimestamp } = require('../helpers/NodeHelper');
const { ADDRESSES } = require('../helpers/Constants');

function getCallTimestamp(tx) {
  return getBlockTimestamp(tx.receipt.blockNumber)
}

describe('#callInLoan', () => {
  const REQUIRED_DEPOSIT = new BigNumber(10);
  let dydxMargin;

  async function callInLoan(
    shortTx,
    deposit = REQUIRED_DEPOSIT,
    from = shortTx.loanOffering.owner
  ) {
    const [lender, seller] = await Promise.all([
      dydxMargin.getShortLender.call(shortTx.id),
      dydxMargin.getshortSeller.call(shortTx.id)
    ]);
    const tx = await dydxMargin.callInLoan(
      shortTx.id,
      deposit,
      { from: from}
    );
    expectLog(tx.logs[0], 'LoanCalled', {
      marginId: shortTx.id,
      lender: lender,
      shortSeller: seller,
      requiredDeposit: deposit
    });

    const shortCalledTimestamp = await getCallTimestamp(tx);

    const {
      callTimestamp,
      requiredDeposit
    } = await getShort(dydxMargin, shortTx.id);

    expect(callTimestamp).to.be.bignumber.equal(shortCalledTimestamp);
    expect(requiredDeposit).to.be.bignumber.equal(deposit);

    return tx;
  }

  contract('Margin', function(accounts) {
    it('sets callTimestamp and requiredDeposit on the short', async () => {
      dydxMargin = await Margin.deployed();
      const shortTx = await doShort(accounts);

      const tx = await callInLoan(shortTx, REQUIRED_DEPOSIT);

      console.log('\tMargin.callInLoan gas used: ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('prevents unauthorized accounts from calling', async () => {
      dydxMargin = await Margin.deployed();
      const shortTx = await doShort(accounts);

      await expectThrow( dydxMargin.callInLoan(
        shortTx.id,
        REQUIRED_DEPOSIT,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getShort(dydxMargin, shortTx.id);

      expect(callTimestamp).to.be.bignumber.equal(0);
    });
  });

  contract('Margin', function(accounts) {
    it('CallLoanDelegator loan owner only allows certain accounts', async () => {
      dydxMargin = await Margin.deployed();
      const shortTx = await doShort(accounts);
      const caller = accounts[8];
      const loanCaller = await TestCallLoanDelegator.new(
        Margin.address,
        caller,
        ADDRESSES.ZERO);
      await dydxMargin.transferLoan(
        shortTx.id,
        loanCaller.address,
        { from: shortTx.loanOffering.payer }
      );
      let short = await getShort(dydxMargin, shortTx.id);
      expect(short.callTimestamp).to.be.bignumber.equal(0);

      await expectThrow( dydxMargin.callInLoan(
        shortTx.id,
        REQUIRED_DEPOSIT,
        { from: accounts[6] }
      ));
      short = await getShort(dydxMargin, shortTx.id);
      expect(short.callTimestamp).to.be.bignumber.equal(0);

      await callInLoan(
        shortTx,
        REQUIRED_DEPOSIT,
        caller
      );
    });
  });

  contract('Margin', function(accounts) {
    it('fails if the loan has already been called', async () => {
      dydxMargin = await Margin.deployed();
      const shortTx = await doShort(accounts);

      await callInLoan(shortTx);

      await expectThrow( dydxMargin.callInLoan(
        shortTx.id,
        REQUIRED_DEPOSIT.plus(REQUIRED_DEPOSIT),
        { from: shortTx.loanOffering.payer }
      ));
    });
  });
});

describe('#cancelLoanCall', () => {
  let dydxMargin;

  async function cancelLoanCall(
    shortTx,
    from = shortTx.loanOffering.owner
  ) {
    const [lender, seller] = await Promise.all([
      dydxMargin.getShortLender.call(shortTx.id),
      dydxMargin.getshortSeller.call(shortTx.id)
    ]);
    const tx = await dydxMargin.cancelLoanCall(
      shortTx.id,
      { from: from }
    );
    expectLog(tx.logs[0], 'LoanCallCanceled', {
      marginId: shortTx.id,
      lender: lender,
      shortSeller: seller,
      depositAmount: 0
    });

    const {
      callTimestamp,
      requiredDeposit
    } = await getShort(dydxMargin, shortTx.id);

    expect(callTimestamp).to.be.bignumber.equal(0);
    expect(requiredDeposit).to.be.bignumber.equal(0);

    return tx;
  }

  contract('Margin', function(accounts) {
    it('unsets callTimestamp and requiredDeposit on the short', async () => {
      dydxMargin = await Margin.deployed();
      const { shortTx } = await doShortAndCall(accounts);

      const tx = await cancelLoanCall(shortTx);

      console.log('\tMargin.cancelLoanCall gas used: ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('prevents unauthorized accounts from cancelling', async () => {
      dydxMargin = await Margin.deployed();
      const { shortTx, callTx } = await doShortAndCall(accounts);

      const shortCalledTimestamp = await getCallTimestamp(callTx);

      await expectThrow( dydxMargin.cancelLoanCall(
        shortTx.id,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getShort(dydxMargin, shortTx.id);

      expect(callTimestamp).to.be.bignumber.equal(shortCalledTimestamp);
    });
  });

  contract('Margin', function(accounts) {
    it('fails if the loan has not been called', async () => {
      dydxMargin = await Margin.deployed();
      const shortTx = await doShort(accounts);

      await expectThrow( dydxMargin.cancelLoanCall(
        shortTx.id,
        { from: shortTx.loanOffering.payer }
      ));
    });
  });

  contract('Margin', function(accounts) {
    it('CallLoanDelegator loan owner only allows certain accounts', async () => {
      dydxMargin = await Margin.deployed();
      const { shortTx } = await doShortAndCall(accounts);
      const canceller = accounts[9];
      const loanCaller = await TestCallLoanDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        canceller);
      await dydxMargin.transferLoan(
        shortTx.id,
        loanCaller.address,
        { from: shortTx.loanOffering.payer }
      );
      let short = await getShort(dydxMargin, shortTx.id);
      expect(short.callTimestamp).to.be.bignumber.not.equal(0);

      await expectThrow( dydxMargin.cancelLoanCall(
        shortTx.id,
        { from: accounts[6] }
      ));
      short = await getShort(dydxMargin, shortTx.id);
      expect(short.callTimestamp).to.be.bignumber.not.equal(0);

      await cancelLoanCall(shortTx, canceller);
    });
  });
});
