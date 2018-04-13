/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const TestCallLoanDelegator = artifacts.require("TestCallLoanDelegator");
const {
  doShort,
  getPosition,
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
    OpenTx,
    deposit = REQUIRED_DEPOSIT,
    from = OpenTx.loanOffering.owner
  ) {
    const [lender, seller] = await Promise.all([
      dydxMargin.getPositionLender.call(OpenTx.id),
      dydxMargin.getPositionSeller.call(OpenTx.id)
    ]);
    const tx = await dydxMargin.callInLoan(
      OpenTx.id,
      deposit,
      { from: from}
    );
    expectLog(tx.logs[0], 'LoanCalled', {
      marginId: OpenTx.id,
      lender: lender,
      shortSeller: seller,
      requiredDeposit: deposit
    });

    const shortCalledTimestamp = await getCallTimestamp(tx);

    const {
      callTimestamp,
      requiredDeposit
    } = await getPosition(dydxMargin, OpenTx.id);

    expect(callTimestamp).to.be.bignumber.equal(shortCalledTimestamp);
    expect(requiredDeposit).to.be.bignumber.equal(deposit);

    return tx;
  }

  contract('Margin', function(accounts) {
    it('sets callTimestamp and requiredDeposit on the short', async () => {
      dydxMargin = await Margin.deployed();
      const OpenTx = await doShort(accounts);

      const tx = await callInLoan(OpenTx, REQUIRED_DEPOSIT);

      console.log('\tMargin.callInLoan gas used: ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('prevents unauthorized accounts from calling', async () => {
      dydxMargin = await Margin.deployed();
      const OpenTx = await doShort(accounts);

      await expectThrow( dydxMargin.callInLoan(
        OpenTx.id,
        REQUIRED_DEPOSIT,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getPosition(dydxMargin, OpenTx.id);

      expect(callTimestamp).to.be.bignumber.equal(0);
    });
  });

  contract('Margin', function(accounts) {
    it('CallLoanDelegator loan owner only allows certain accounts', async () => {
      dydxMargin = await Margin.deployed();
      const OpenTx = await doShort(accounts);
      const caller = accounts[8];
      const loanCaller = await TestCallLoanDelegator.new(
        Margin.address,
        caller,
        ADDRESSES.ZERO);
      await dydxMargin.transferLoan(
        OpenTx.id,
        loanCaller.address,
        { from: OpenTx.loanOffering.payer }
      );
      let position = await getPosition(dydxMargin, OpenTx.id);
      expect(position.callTimestamp).to.be.bignumber.equal(0);

      await expectThrow( dydxMargin.callInLoan(
        OpenTx.id,
        REQUIRED_DEPOSIT,
        { from: accounts[6] }
      ));
      position = await getPosition(dydxMargin, OpenTx.id);
      expect(position.callTimestamp).to.be.bignumber.equal(0);

      await callInLoan(
        OpenTx,
        REQUIRED_DEPOSIT,
        caller
      );
    });
  });

  contract('Margin', function(accounts) {
    it('fails if the loan has already been called', async () => {
      dydxMargin = await Margin.deployed();
      const OpenTx = await doShort(accounts);

      await callInLoan(OpenTx);

      await expectThrow( dydxMargin.callInLoan(
        OpenTx.id,
        REQUIRED_DEPOSIT.plus(REQUIRED_DEPOSIT),
        { from: OpenTx.loanOffering.payer }
      ));
    });
  });
});

describe('#cancelLoanCall', () => {
  let dydxMargin;

  async function cancelLoanCall(
    OpenTx,
    from = OpenTx.loanOffering.owner
  ) {
    const [lender, seller] = await Promise.all([
      dydxMargin.getPositionLender.call(OpenTx.id),
      dydxMargin.getPositionSeller.call(OpenTx.id)
    ]);
    const tx = await dydxMargin.cancelLoanCall(
      OpenTx.id,
      { from: from }
    );
    expectLog(tx.logs[0], 'LoanCallCanceled', {
      marginId: OpenTx.id,
      lender: lender,
      shortSeller: seller,
      depositAmount: 0
    });

    const {
      callTimestamp,
      requiredDeposit
    } = await getPosition(dydxMargin, OpenTx.id);

    expect(callTimestamp).to.be.bignumber.equal(0);
    expect(requiredDeposit).to.be.bignumber.equal(0);

    return tx;
  }

  contract('Margin', function(accounts) {
    it('unsets callTimestamp and requiredDeposit on the short', async () => {
      dydxMargin = await Margin.deployed();
      const { OpenTx } = await doShortAndCall(accounts);

      const tx = await cancelLoanCall(OpenTx);

      console.log('\tMargin.cancelLoanCall gas used: ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('prevents unauthorized accounts from cancelling', async () => {
      dydxMargin = await Margin.deployed();
      const { OpenTx, callTx } = await doShortAndCall(accounts);

      const shortCalledTimestamp = await getCallTimestamp(callTx);

      await expectThrow( dydxMargin.cancelLoanCall(
        OpenTx.id,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getPosition(dydxMargin, OpenTx.id);

      expect(callTimestamp).to.be.bignumber.equal(shortCalledTimestamp);
    });
  });

  contract('Margin', function(accounts) {
    it('fails if the loan has not been called', async () => {
      dydxMargin = await Margin.deployed();
      const OpenTx = await doShort(accounts);

      await expectThrow( dydxMargin.cancelLoanCall(
        OpenTx.id,
        { from: OpenTx.loanOffering.payer }
      ));
    });
  });

  contract('Margin', function(accounts) {
    it('CallLoanDelegator loan owner only allows certain accounts', async () => {
      dydxMargin = await Margin.deployed();
      const { OpenTx } = await doShortAndCall(accounts);
      const canceller = accounts[9];
      const loanCaller = await TestCallLoanDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        canceller);
      await dydxMargin.transferLoan(
        OpenTx.id,
        loanCaller.address,
        { from: OpenTx.loanOffering.payer }
      );
      let position = await getPosition(dydxMargin, OpenTx.id);
      expect(position.callTimestamp).to.be.bignumber.not.equal(0);

      await expectThrow( dydxMargin.cancelLoanCall(
        OpenTx.id,
        { from: accounts[6] }
      ));
      position = await getPosition(dydxMargin, OpenTx.id);
      expect(position.callTimestamp).to.be.bignumber.not.equal(0);

      await cancelLoanCall(OpenTx, canceller);
    });
  });
});
