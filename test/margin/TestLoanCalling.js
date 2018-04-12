/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const TestMarginCallDelegator = artifacts.require("TestMarginCallDelegator");
const {
  doOpenPosition,
  getPosition,
  doOpenPositionAndCall
} = require('../helpers/MarginHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { expectLog } = require('../helpers/EventHelper');
const { getBlockTimestamp } = require('../helpers/NodeHelper');
const { ADDRESSES } = require('../helpers/Constants');

function getCallTimestamp(tx) {
  return getBlockTimestamp(tx.receipt.blockNumber)
}

describe('#marginCall', () => {
  const REQUIRED_DEPOSIT = new BigNumber(10);
  let margin;

  async function marginCall(
    OpenPositionTx,
    deposit = REQUIRED_DEPOSIT,
    from = OpenPositionTx.loanOffering.owner
  ) {
    const [lender, trader] = await Promise.all([
      margin.getPositionLender.call(OpenPositionTx.id),
      margin.getPositionTrader.call(OpenPositionTx.id)
    ]);
    const tx = await margin.marginCall(
      OpenPositionTx.id,
      deposit,
      { from: from}
    );
    expectLog(tx.logs[0], 'MarginCallInitiated', {
      marginId: OpenPositionTx.id,
      lender: lender,
      trader: trader,
      requiredDeposit: deposit
    });

    const positionCalledTimestamp = await getCallTimestamp(tx);

    const {
      callTimestamp,
      requiredDeposit
    } = await getPosition(margin, OpenPositionTx.id);

    expect(callTimestamp).to.be.bignumber.equal(positionCalledTimestamp);
    expect(requiredDeposit).to.be.bignumber.equal(deposit);

    return tx;
  }

  contract('Margin', function(accounts) {
    it('sets callTimestamp and requiredDeposit on the position', async () => {
      margin = await Margin.deployed();
      const OpenPositionTx = await doOpenPosition(accounts);

      const tx = await marginCall(OpenPositionTx, REQUIRED_DEPOSIT);

      console.log('\tMargin.marginCall gas used: ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('prevents unauthorized accounts from calling', async () => {
      margin = await Margin.deployed();
      const OpenPositionTx = await doOpenPosition(accounts);

      await expectThrow( margin.marginCall(
        OpenPositionTx.id,
        REQUIRED_DEPOSIT,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getPosition(margin, OpenPositionTx.id);

      expect(callTimestamp).to.be.bignumber.equal(0);
    });
  });

  contract('Margin', function(accounts) {
    it('MarginCallDelegator loan owner only allows certain accounts', async () => {
      margin = await Margin.deployed();
      const OpenPositionTx = await doOpenPosition(accounts);
      const caller = accounts[8];
      const loanCaller = await TestMarginCallDelegator.new(
        Margin.address,
        caller,
        ADDRESSES.ZERO);
      await margin.transferLoan(
        OpenPositionTx.id,
        loanCaller.address,
        { from: OpenPositionTx.loanOffering.payer }
      );
      let position = await getPosition(margin, OpenPositionTx.id);
      expect(position.callTimestamp).to.be.bignumber.equal(0);

      await expectThrow( margin.marginCall(
        OpenPositionTx.id,
        REQUIRED_DEPOSIT,
        { from: accounts[6] }
      ));
      position = await getPosition(margin, OpenPositionTx.id);
      expect(position.callTimestamp).to.be.bignumber.equal(0);

      await marginCall(
        OpenPositionTx,
        REQUIRED_DEPOSIT,
        caller
      );
    });
  });

  contract('Margin', function(accounts) {
    it('fails if the loan has already been called', async () => {
      margin = await Margin.deployed();
      const OpenPositionTx = await doOpenPosition(accounts);

      await marginCall(OpenPositionTx);

      await expectThrow( margin.marginCall(
        OpenPositionTx.id,
        REQUIRED_DEPOSIT.plus(REQUIRED_DEPOSIT),
        { from: OpenPositionTx.loanOffering.payer }
      ));
    });
  });
});

describe('#cancelMarginCall', () => {
  let margin;

  async function cancelMarginCall(
    OpenPositionTx,
    from = OpenPositionTx.loanOffering.owner
  ) {
    const [lender, trader] = await Promise.all([
      margin.getPositionLender.call(OpenPositionTx.id),
      margin.getPositionTrader.call(OpenPositionTx.id)
    ]);
    const tx = await margin.cancelMarginCall(
      OpenPositionTx.id,
      { from: from }
    );
    expectLog(tx.logs[0], 'MarginCallCanceled', {
      marginId: OpenPositionTx.id,
      lender: lender,
      trader: trader,
      depositAmount: 0
    });

    const {
      callTimestamp,
      requiredDeposit
    } = await getPosition(margin, OpenPositionTx.id);

    expect(callTimestamp).to.be.bignumber.equal(0);
    expect(requiredDeposit).to.be.bignumber.equal(0);

    return tx;
  }

  contract('Margin', function(accounts) {
    it('unsets callTimestamp and requiredDeposit on the position', async () => {
      margin = await Margin.deployed();
      const { OpenPositionTx } = await doOpenPositionAndCall(accounts);

      const tx = await cancelMarginCall(OpenPositionTx);

      console.log('\tMargin.cancelMarginCall gas used: ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('prevents unauthorized accounts from cancelling', async () => {
      margin = await Margin.deployed();
      const { OpenPositionTx, callTx } = await doOpenPositionAndCall(accounts);

      const positionCalledTimestamp = await getCallTimestamp(callTx);

      await expectThrow( margin.cancelMarginCall(
        OpenPositionTx.id,
        { from: accounts[6] }
      ));

      const { callTimestamp } = await getPosition(margin, OpenPositionTx.id);

      expect(callTimestamp).to.be.bignumber.equal(positionCalledTimestamp);
    });
  });

  contract('Margin', function(accounts) {
    it('fails if the loan has not been called', async () => {
      margin = await Margin.deployed();
      const OpenPositionTx = await doOpenPosition(accounts);

      await expectThrow( margin.cancelMarginCall(
        OpenPositionTx.id,
        { from: OpenPositionTx.loanOffering.payer }
      ));
    });
  });

  contract('Margin', function(accounts) {
    it('MarginCallDelegator loan owner only allows certain accounts', async () => {
      margin = await Margin.deployed();
      const { OpenPositionTx } = await doOpenPositionAndCall(accounts);
      const canceller = accounts[9];
      const loanCaller = await TestMarginCallDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        canceller);
      await margin.transferLoan(
        OpenPositionTx.id,
        loanCaller.address,
        { from: OpenPositionTx.loanOffering.payer }
      );
      let position = await getPosition(margin, OpenPositionTx.id);
      expect(position.callTimestamp).to.be.bignumber.not.equal(0);

      await expectThrow( margin.cancelMarginCall(
        OpenPositionTx.id,
        { from: accounts[6] }
      ));
      position = await getPosition(margin, OpenPositionTx.id);
      expect(position.callTimestamp).to.be.bignumber.not.equal(0);

      await cancelMarginCall(OpenPositionTx, canceller);
    });
  });
});
