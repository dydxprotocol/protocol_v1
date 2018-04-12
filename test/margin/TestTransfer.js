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
  let margin, openTx;

  async function transferPosition_THROW(openTx, to, from) {
    const originalTrader = await margin.getPositionTrader(openTx.id);
    await expectThrow(
      margin.transferPosition(openTx.id, to, { from: from })
    );
    const trader = await margin.getPositionTrader(openTx.id);
    expect(trader).to.eq(originalTrader);
    return;
  }

  async function transferPosition(openTx, to, from, expectedTrader = null) {
    expectedTrader = expectedTrader || to;
    const tx = await margin.transferPosition(openTx.id, to, { from: from});

    if (expectedTrader === to) {
      expectLog(tx.logs[0], 'PositionTransferred', {
        marginId: openTx.id,
        from: from,
        to: to
      });
    } else {
      expectLog(tx.logs[0], 'PositionTransferred', {
        marginId: openTx.id,
        from: from,
        to: to
      });
      expectLog(tx.logs[1], 'PositionTransferred', {
        marginId: openTx.id,
        from: to,
        to: expectedTrader
      });
    }

    const trader = await margin.getPositionTrader(openTx.id);
    expect(trader.toLowerCase()).to.eq((expectedTrader).toLowerCase());

    return tx;
  }

  contract('Margin', function(accounts) {
    const toAddress = accounts[9];

    before('set up a margin position', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      expect(openTx.trader).to.not.equal(toAddress);
    });

    it('only allows trader to transfer', async () => {
      await transferPosition_THROW(openTx, toAddress, toAddress);
    });

    it('fails if transferring to self', async () => {
      await transferPosition_THROW(openTx, openTx.trader, openTx.trader);
    });

    it('transfers ownership of a margin position', async () => {
      const tx = await transferPosition(openTx, toAddress, openTx.trader);
      console.log('\tMargin.transferPosition gas used: ' + tx.receipt.gasUsed);
    });

    it('fails if already transferred', async () => {
      await transferPosition_THROW(openTx, toAddress, openTx.trader);
    });

    it('fails for invalid id', async () => {
      await transferPosition_THROW({id: BYTES32.BAD_ID}, toAddress, openTx.trader);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract with the correct interface', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        margin.address,
        ADDRESSES.ZERO,
        false);

      const tx = await transferPosition(
        openTx,
        testClosePositionDelegator.address,
        openTx.trader);
      console.log('\tMargin.transferPosition gas used (to contract): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract that chains to another contract', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        margin.address,
        ADDRESSES.ZERO,
        false);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        testClosePositionDelegator.address,
        false);

      const tx = await transferPosition(
        openTx,
        testPositionOwner.address,
        openTx.trader,
        testClosePositionDelegator.address);
      console.log('\tMargin.transferPosition gas used (chains thru): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers to 0x0', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        ADDRESSES.ZERO,
        false);

      await transferPosition_THROW(openTx, testPositionOwner.address, openTx.trader);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers back to original owner', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        openTx.trader,
        false);

      await transferPosition_THROW(openTx, testPositionOwner.address, openTx.trader);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to an arbitrary contract', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      await transferPosition_THROW(openTx, TokenA.address, openTx.trader);
    });
  });
});

describe('#transferLoan', () => {
  let margin, openTx;

  async function transferLoan_THROW(openTx, to, from,) {
    const originalLender = await margin.getPositionLender(openTx.id);
    await expectThrow(
      margin.transferLoan(openTx.id, to, { from: from })
    );
    const lender = await margin.getPositionLender(openTx.id);
    expect(lender).to.eq(originalLender);
    return;
  }

  async function transferLoan(openTx, to, from, expectedLender = null) {
    expectedLender = expectedLender || to;
    const tx = await margin.transferLoan(openTx.id, to, { from: from});

    if (expectedLender === to) {
      expectLog(tx.logs[0], 'LoanTransferred', {
        marginId: openTx.id,
        from: from,
        to: to
      });
    } else {
      expectLog(tx.logs[0], 'LoanTransferred', {
        marginId: openTx.id,
        from: from,
        to: to
      });
      expectLog(tx.logs[1], 'LoanTransferred', {
        marginId: openTx.id,
        from: to,
        to: expectedLender
      });
    }

    const lender = await margin.getPositionLender(openTx.id);
    expect(lender.toLowerCase()).to.eq((expectedLender).toLowerCase());

    return tx;
  }

  contract('Margin', function(accounts) {
    const toAddress = accounts[9];

    before('set up a margin position', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      expect(openTx.loanOffering.payer).to.not.equal(toAddress);
    });

    it('only allows the position lender to transfer', async () => {
      await transferLoan_THROW(openTx, toAddress, toAddress);
    });

    it('fails if transferring to self', async () => {
      await transferLoan_THROW(openTx, openTx.loanOffering.payer,openTx.loanOffering.payer);
    });

    it('transfers ownership of a loan', async () => {
      const tx = await transferLoan(openTx, toAddress, openTx.loanOffering.payer);
      console.log('\tMargin.transferLoan gas used: ' + tx.receipt.gasUsed);
    });

    it('fails if already transferred', async () => {
      await transferLoan_THROW(openTx, toAddress, openTx.loanOffering.payer);
    });

    it('fails for invalid id', async () => {
      await transferLoan_THROW({id: BYTES32.BAD_ID}, toAddress, openTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract with the correct interface', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);

      const tx =
        await transferLoan(openTx, testMarginCallDelegator.address, openTx.loanOffering.payer);
      const { lender } = await getPosition(margin, openTx.id);
      expect(lender.toLowerCase()).to.eq(testMarginCallDelegator.address.toLowerCase());
      console.log('\tMargin.transferLoan gas used (to contract): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract that chains to another contract', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testLoanOwner = await TestLoanOwner.new(
        margin.address,
        testMarginCallDelegator.address,
        false);

      const tx = await transferLoan(
        openTx,
        testLoanOwner.address,
        openTx.loanOffering.payer,
        testMarginCallDelegator.address);
      console.log('\tMargin.transferLoan gas used (chain thru): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers to 0x0', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      const testLoanOwner = await TestLoanOwner.new(
        margin.address,
        ADDRESSES.ZERO,
        false);

      await transferLoan_THROW(openTx, testLoanOwner.address, openTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers back to original owner', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      const testLoanOwner = await TestLoanOwner.new(
        margin.address,
        openTx.loanOffering.payer,
        false);

      await transferLoan_THROW(openTx, testLoanOwner.address, openTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to an arbitrary contract', async () => {
      margin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      await transferLoan_THROW(openTx, TokenA.address, openTx.loanOffering.payer);
    });
  });
});
