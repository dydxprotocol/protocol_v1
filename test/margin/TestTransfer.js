/*global artifacts, contract, describe, before, it*/

const expect = require('chai').expect;

const TokenA = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");
const TestClosePositionDelegator = artifacts.require("TestClosePositionDelegator");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const TestCallLoanDelegator = artifacts.require("TestCallLoanDelegator");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const {
  doShort,
  getPosition
} = require('../helpers/MarginHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { expectLog } = require('../helpers/EventHelper');
const { ADDRESSES, BYTES32 } = require('../helpers/Constants');

describe('#transferPosition', () => {
  let dydxMargin, OpenTx;

  async function transferPosition_THROW(OpenTx, to, from) {
    const originalSeller = await dydxMargin.getPositionSeller(OpenTx.id);
    await expectThrow(
      dydxMargin.transferPosition(OpenTx.id, to, { from: from })
    );
    const seller = await dydxMargin.getPositionSeller(OpenTx.id);
    expect(seller).to.eq(originalSeller);
    return;
  }

  async function transferPosition(OpenTx, to, from, expectedSeller = null) {
    expectedSeller = expectedSeller || to;
    const tx = await dydxMargin.transferPosition(OpenTx.id, to, { from: from});

    if (expectedSeller === to) {
      expectLog(tx.logs[0], 'ShortTransferred', {
        marginId: OpenTx.id,
        from: from,
        to: to
      });
    } else {
      expectLog(tx.logs[0], 'ShortTransferred', {
        marginId: OpenTx.id,
        from: from,
        to: to
      });
      expectLog(tx.logs[1], 'ShortTransferred', {
        marginId: OpenTx.id,
        from: to,
        to: expectedSeller
      });
    }

    const seller = await dydxMargin.getPositionSeller(OpenTx.id);
    expect(seller.toLowerCase()).to.eq((expectedSeller).toLowerCase());

    return tx;
  }

  contract('Margin', function(accounts) {
    const toAddress = accounts[9];

    before('set up a short', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      expect(OpenTx.seller).to.not.equal(toAddress);
    });

    it('only allows short seller to transfer', async () => {
      await transferPosition_THROW(OpenTx, toAddress, toAddress);
    });

    it('fails if transferring to self', async () => {
      await transferPosition_THROW(OpenTx, OpenTx.seller, OpenTx.seller);
    });

    it('transfers ownership of a short', async () => {
      const tx = await transferPosition(OpenTx, toAddress, OpenTx.seller);
      console.log('\tMargin.transferPosition gas used: ' + tx.receipt.gasUsed);
    });

    it('fails if already transferred', async () => {
      await transferPosition_THROW(OpenTx, toAddress, OpenTx.seller);
    });

    it('fails for invalid id', async () => {
      await transferPosition_THROW({id: BYTES32.BAD_ID}, toAddress, OpenTx.seller);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract with the correct interface', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        false);

      const tx = await transferPosition(
        OpenTx,
        testClosePositionDelegator.address,
        OpenTx.seller);
      console.log('\tMargin.transferPosition gas used (to contract): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract that chains to another contract', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        false);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        testClosePositionDelegator.address,
        false);

      const tx = await transferPosition(
        OpenTx,
        testPositionOwner.address,
        OpenTx.seller,
        testClosePositionDelegator.address);
      console.log('\tMargin.transferPosition gas used (chains thru): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers to 0x0', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        ADDRESSES.ZERO,
        false);

      await transferPosition_THROW(OpenTx, testPositionOwner.address, OpenTx.seller);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers back to original owner', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        OpenTx.seller,
        false);

      await transferPosition_THROW(OpenTx, testPositionOwner.address, OpenTx.seller);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to an arbitrary contract', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      await transferPosition_THROW(OpenTx, TokenA.address, OpenTx.seller);
    });
  });
});

describe('#transferLoan', () => {
  let dydxMargin, OpenTx;

  async function transferLoan_THROW(OpenTx, to, from,) {
    const originalLender = await dydxMargin.getPositionLender(OpenTx.id);
    await expectThrow(
      dydxMargin.transferLoan(OpenTx.id, to, { from: from })
    );
    const lender = await dydxMargin.getPositionLender(OpenTx.id);
    expect(lender).to.eq(originalLender);
    return;
  }

  async function transferLoan(OpenTx, to, from, expectedLender = null) {
    expectedLender = expectedLender || to;
    const tx = await dydxMargin.transferLoan(OpenTx.id, to, { from: from});

    if (expectedLender === to) {
      expectLog(tx.logs[0], 'LoanTransferred', {
        marginId: OpenTx.id,
        from: from,
        to: to
      });
    } else {
      expectLog(tx.logs[0], 'LoanTransferred', {
        marginId: OpenTx.id,
        from: from,
        to: to
      });
      expectLog(tx.logs[1], 'LoanTransferred', {
        marginId: OpenTx.id,
        from: to,
        to: expectedLender
      });
    }

    const lender = await dydxMargin.getPositionLender(OpenTx.id);
    expect(lender.toLowerCase()).to.eq((expectedLender).toLowerCase());

    return tx;
  }

  contract('Margin', function(accounts) {
    const toAddress = accounts[9];

    before('set up a short', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      expect(OpenTx.loanOffering.payer).to.not.equal(toAddress);
    });

    it('only allows short lender to transfer', async () => {
      await transferLoan_THROW(OpenTx, toAddress, toAddress);
    });

    it('fails if transferring to self', async () => {
      await transferLoan_THROW(OpenTx, OpenTx.loanOffering.payer,OpenTx.loanOffering.payer);
    });

    it('transfers ownership of a loan', async () => {
      const tx = await transferLoan(OpenTx, toAddress, OpenTx.loanOffering.payer);
      console.log('\tMargin.transferLoan gas used: ' + tx.receipt.gasUsed);
    });

    it('fails if already transferred', async () => {
      await transferLoan_THROW(OpenTx, toAddress, OpenTx.loanOffering.payer);
    });

    it('fails for invalid id', async () => {
      await transferLoan_THROW({id: BYTES32.BAD_ID}, toAddress, OpenTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract with the correct interface', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);

      const tx =
        await transferLoan(OpenTx, testCallLoanDelegator.address, OpenTx.loanOffering.payer);
      const { lender } = await getPosition(dydxMargin, OpenTx.id);
      expect(lender.toLowerCase()).to.eq(testCallLoanDelegator.address.toLowerCase());
      console.log('\tMargin.transferLoan gas used (to contract): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract that chains to another contract', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testLoanOwner = await TestLoanOwner.new(
        dydxMargin.address,
        testCallLoanDelegator.address,
        false);

      const tx = await transferLoan(
        OpenTx,
        testLoanOwner.address,
        OpenTx.loanOffering.payer,
        testCallLoanDelegator.address);
      console.log('\tMargin.transferLoan gas used (chain thru): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers to 0x0', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      const testLoanOwner = await TestLoanOwner.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        false);

      await transferLoan_THROW(OpenTx, testLoanOwner.address, OpenTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers back to original owner', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      const testLoanOwner = await TestLoanOwner.new(
        dydxMargin.address,
        OpenTx.loanOffering.payer,
        false);

      await transferLoan_THROW(OpenTx, testLoanOwner.address, OpenTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to an arbitrary contract', async () => {
      dydxMargin = await Margin.deployed();
      OpenTx = await doShort(accounts);
      await transferLoan_THROW(OpenTx, TokenA.address, OpenTx.loanOffering.payer);
    });
  });
});
