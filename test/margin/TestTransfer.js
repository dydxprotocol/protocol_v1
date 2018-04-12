/*global artifacts, contract, describe, before, it*/

const expect = require('chai').expect;

const TokenA = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");
const TestClosePositionDelegator = artifacts.require("TestClosePositionDelegator");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const TestMarginCallDelegator = artifacts.require("TestMarginCallDelegator");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const {
  doOpenPosition,
  getPosition
} = require('../helpers/MarginHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { expectLog } = require('../helpers/EventHelper');
const { ADDRESSES, BYTES32 } = require('../helpers/Constants');

describe('#transferPosition', () => {
  let margin, OpenPositionTx;

  async function transferPosition_THROW(OpenPositionTx, to, from) {
    const originalTrader = await margin.getPositionTrader(OpenPositionTx.id);
    await expectThrow(
      margin.transferPosition(OpenPositionTx.id, to, { from: from })
    );
    const trader = await margin.getPositionTrader(OpenPositionTx.id);
    expect(trader).to.eq(originalTrader);
    return;
  }

  async function transferPosition(OpenPositionTx, to, from, expectedTrader = null) {
    expectedTrader = expectedTrader || to;
    const tx = await margin.transferPosition(OpenPositionTx.id, to, { from: from});

    if (expectedTrader === to) {
      expectLog(tx.logs[0], 'PositionTransferred', {
        marginId: OpenPositionTx.id,
        from: from,
        to: to
      });
    } else {
      expectLog(tx.logs[0], 'PositionTransferred', {
        marginId: OpenPositionTx.id,
        from: from,
        to: to
      });
      expectLog(tx.logs[1], 'PositionTransferred', {
        marginId: OpenPositionTx.id,
        from: to,
        to: expectedTrader
      });
    }

    const trader = await margin.getPositionTrader(OpenPositionTx.id);
    expect(trader.toLowerCase()).to.eq((expectedTrader).toLowerCase());

    return tx;
  }

  contract('Margin', function(accounts) {
    const toAddress = accounts[9];

    before('set up a margin position', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      expect(OpenPositionTx.trader).to.not.equal(toAddress);
    });

    it('only allows margin trader to transfer', async () => {
      await transferPosition_THROW(OpenPositionTx, toAddress, toAddress);
    });

    it('fails if transferring to self', async () => {
      await transferPosition_THROW(OpenPositionTx, OpenPositionTx.trader, OpenPositionTx.trader);
    });

    it('transfers ownership of a margin position', async () => {
      const tx = await transferPosition(OpenPositionTx, toAddress, OpenPositionTx.trader);
      console.log('\tMargin.transferPosition gas used: ' + tx.receipt.gasUsed);
    });

    it('fails if already transferred', async () => {
      await transferPosition_THROW(OpenPositionTx, toAddress, OpenPositionTx.trader);
    });

    it('fails for invalid id', async () => {
      await transferPosition_THROW({id: BYTES32.BAD_ID}, toAddress, OpenPositionTx.trader);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract with the correct interface', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        margin.address,
        ADDRESSES.ZERO,
        false);

      const tx = await transferPosition(
        OpenPositionTx,
        testClosePositionDelegator.address,
        OpenPositionTx.trader);
      console.log('\tMargin.transferPosition gas used (to contract): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract that chains to another contract', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        margin.address,
        ADDRESSES.ZERO,
        false);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        testClosePositionDelegator.address,
        false);

      const tx = await transferPosition(
        OpenPositionTx,
        testPositionOwner.address,
        OpenPositionTx.trader,
        testClosePositionDelegator.address);
      console.log('\tMargin.transferPosition gas used (chains thru): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers to 0x0', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        ADDRESSES.ZERO,
        false);

      await transferPosition_THROW(OpenPositionTx, testPositionOwner.address, OpenPositionTx.trader);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers back to original owner', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        OpenPositionTx.trader,
        false);

      await transferPosition_THROW(OpenPositionTx, testPositionOwner.address, OpenPositionTx.trader);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to an arbitrary contract', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      await transferPosition_THROW(OpenPositionTx, TokenA.address, OpenPositionTx.trader);
    });
  });
});

describe('#transferLoan', () => {
  let margin, OpenPositionTx;

  async function transferLoan_THROW(OpenPositionTx, to, from,) {
    const originalLender = await margin.getPositionLender(OpenPositionTx.id);
    await expectThrow(
      margin.transferLoan(OpenPositionTx.id, to, { from: from })
    );
    const lender = await margin.getPositionLender(OpenPositionTx.id);
    expect(lender).to.eq(originalLender);
    return;
  }

  async function transferLoan(OpenPositionTx, to, from, expectedLender = null) {
    expectedLender = expectedLender || to;
    const tx = await margin.transferLoan(OpenPositionTx.id, to, { from: from});

    if (expectedLender === to) {
      expectLog(tx.logs[0], 'LenderTransferred', {
        marginId: OpenPositionTx.id,
        from: from,
        to: to
      });
    } else {
      expectLog(tx.logs[0], 'LenderTransferred', {
        marginId: OpenPositionTx.id,
        from: from,
        to: to
      });
      expectLog(tx.logs[1], 'LenderTransferred', {
        marginId: OpenPositionTx.id,
        from: to,
        to: expectedLender
      });
    }

    const lender = await margin.getPositionLender(OpenPositionTx.id);
    expect(lender.toLowerCase()).to.eq((expectedLender).toLowerCase());

    return tx;
  }

  contract('Margin', function(accounts) {
    const toAddress = accounts[9];

    before('set up a margin position', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      expect(OpenPositionTx.loanOffering.payer).to.not.equal(toAddress);
    });

    it('only allows the position lender to transfer', async () => {
      await transferLoan_THROW(OpenPositionTx, toAddress, toAddress);
    });

    it('fails if transferring to self', async () => {
      await transferLoan_THROW(OpenPositionTx, OpenPositionTx.loanOffering.payer,OpenPositionTx.loanOffering.payer);
    });

    it('transfers ownership of a loan', async () => {
      const tx = await transferLoan(OpenPositionTx, toAddress, OpenPositionTx.loanOffering.payer);
      console.log('\tMargin.transferLoan gas used: ' + tx.receipt.gasUsed);
    });

    it('fails if already transferred', async () => {
      await transferLoan_THROW(OpenPositionTx, toAddress, OpenPositionTx.loanOffering.payer);
    });

    it('fails for invalid id', async () => {
      await transferLoan_THROW({id: BYTES32.BAD_ID}, toAddress, OpenPositionTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract with the correct interface', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);

      const tx =
        await transferLoan(OpenPositionTx, testMarginCallDelegator.address, OpenPositionTx.loanOffering.payer);
      const { lender } = await getPosition(margin, OpenPositionTx.id);
      expect(lender.toLowerCase()).to.eq(testMarginCallDelegator.address.toLowerCase());
      console.log('\tMargin.transferLoan gas used (to contract): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract that chains to another contract', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testLoanOwner = await TestLoanOwner.new(
        margin.address,
        testMarginCallDelegator.address,
        false);

      const tx = await transferLoan(
        OpenPositionTx,
        testLoanOwner.address,
        OpenPositionTx.loanOffering.payer,
        testMarginCallDelegator.address);
      console.log('\tMargin.transferLoan gas used (chain thru): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers to 0x0', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      const testLoanOwner = await TestLoanOwner.new(
        margin.address,
        ADDRESSES.ZERO,
        false);

      await transferLoan_THROW(OpenPositionTx, testLoanOwner.address, OpenPositionTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers back to original owner', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      const testLoanOwner = await TestLoanOwner.new(
        margin.address,
        OpenPositionTx.loanOffering.payer,
        false);

      await transferLoan_THROW(OpenPositionTx, testLoanOwner.address, OpenPositionTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to an arbitrary contract', async () => {
      margin = await Margin.deployed();
      OpenPositionTx = await doOpenPosition(accounts);
      await transferLoan_THROW(OpenPositionTx, TokenA.address, OpenPositionTx.loanOffering.payer);
    });
  });
});
