/*global artifacts, contract, describe, before, it*/

const expect = require('chai').expect;

const TokenA = artifacts.require("TokenA");
const Margin = artifacts.require("Margin");
const TestCloseShortDelegator = artifacts.require("TestCloseShortDelegator");
const TestShortOwner = artifacts.require("TestShortOwner");
const TestCallLoanDelegator = artifacts.require("TestCallLoanDelegator");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const {
  doShort,
  getShort
} = require('../helpers/MarginHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { expectLog } = require('../helpers/EventHelper');
const { ADDRESSES, BYTES32 } = require('../helpers/Constants');

describe('#transferShort', () => {
  let dydxMargin, shortTx;

  async function transferShort_THROW(shortTx, to, from) {
    const originalSeller = await dydxMargin.getshortSeller(shortTx.id);
    await expectThrow(
      dydxMargin.transferShort(shortTx.id, to, { from: from })
    );
    const seller = await dydxMargin.getshortSeller(shortTx.id);
    expect(seller).to.eq(originalSeller);
    return;
  }

  async function transferShort(shortTx, to, from, expectedSeller = null) {
    expectedSeller = expectedSeller || to;
    const tx = await dydxMargin.transferShort(shortTx.id, to, { from: from});

    if (expectedSeller === to) {
      expectLog(tx.logs[0], 'ShortTransferred', {
        marginId: shortTx.id,
        from: from,
        to: to
      });
    } else {
      expectLog(tx.logs[0], 'ShortTransferred', {
        marginId: shortTx.id,
        from: from,
        to: to
      });
      expectLog(tx.logs[1], 'ShortTransferred', {
        marginId: shortTx.id,
        from: to,
        to: expectedSeller
      });
    }

    const seller = await dydxMargin.getshortSeller(shortTx.id);
    expect(seller.toLowerCase()).to.eq((expectedSeller).toLowerCase());

    return tx;
  }

  contract('Margin', function(accounts) {
    const toAddress = accounts[9];

    before('set up a short', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      expect(shortTx.seller).to.not.equal(toAddress);
    });

    it('only allows short seller to transfer', async () => {
      await transferShort_THROW(shortTx, toAddress, toAddress);
    });

    it('fails if transferring to self', async () => {
      await transferShort_THROW(shortTx, shortTx.seller, shortTx.seller);
    });

    it('transfers ownership of a short', async () => {
      const tx = await transferShort(shortTx, toAddress, shortTx.seller);
      console.log('\tMargin.transferShort gas used: ' + tx.receipt.gasUsed);
    });

    it('fails if already transferred', async () => {
      await transferShort_THROW(shortTx, toAddress, shortTx.seller);
    });

    it('fails for invalid id', async () => {
      await transferShort_THROW({id: BYTES32.BAD_ID}, toAddress, shortTx.seller);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract with the correct interface', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      const testCloseShortDelegator = await TestCloseShortDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        false);

      const tx = await transferShort(
        shortTx,
        testCloseShortDelegator.address,
        shortTx.seller);
      console.log('\tMargin.transferShort gas used (to contract): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract that chains to another contract', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      const testCloseShortDelegator = await TestCloseShortDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        false);
      const testShortOwner = await TestShortOwner.new(
        Margin.address,
        testCloseShortDelegator.address,
        false);

      const tx = await transferShort(
        shortTx,
        testShortOwner.address,
        shortTx.seller,
        testCloseShortDelegator.address);
      console.log('\tMargin.transferShort gas used (chains thru): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers to 0x0', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      const testShortOwner = await TestShortOwner.new(
        Margin.address,
        ADDRESSES.ZERO,
        false);

      await transferShort_THROW(shortTx, testShortOwner.address, shortTx.seller);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers back to original owner', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      const testShortOwner = await TestShortOwner.new(
        Margin.address,
        shortTx.seller,
        false);

      await transferShort_THROW(shortTx, testShortOwner.address, shortTx.seller);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to an arbitrary contract', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      await transferShort_THROW(shortTx, TokenA.address, shortTx.seller);
    });
  });
});

describe('#transferLoan', () => {
  let dydxMargin, shortTx;

  async function transferLoan_THROW(shortTx, to, from,) {
    const originalLender = await dydxMargin.getShortLender(shortTx.id);
    await expectThrow(
      dydxMargin.transferLoan(shortTx.id, to, { from: from })
    );
    const lender = await dydxMargin.getShortLender(shortTx.id);
    expect(lender).to.eq(originalLender);
    return;
  }

  async function transferLoan(shortTx, to, from, expectedLender = null) {
    expectedLender = expectedLender || to;
    const tx = await dydxMargin.transferLoan(shortTx.id, to, { from: from});

    if (expectedLender === to) {
      expectLog(tx.logs[0], 'LoanTransferred', {
        marginId: shortTx.id,
        from: from,
        to: to
      });
    } else {
      expectLog(tx.logs[0], 'LoanTransferred', {
        marginId: shortTx.id,
        from: from,
        to: to
      });
      expectLog(tx.logs[1], 'LoanTransferred', {
        marginId: shortTx.id,
        from: to,
        to: expectedLender
      });
    }

    const lender = await dydxMargin.getShortLender(shortTx.id);
    expect(lender.toLowerCase()).to.eq((expectedLender).toLowerCase());

    return tx;
  }

  contract('Margin', function(accounts) {
    const toAddress = accounts[9];

    before('set up a short', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      expect(shortTx.loanOffering.payer).to.not.equal(toAddress);
    });

    it('only allows short lender to transfer', async () => {
      await transferLoan_THROW(shortTx, toAddress, toAddress);
    });

    it('fails if transferring to self', async () => {
      await transferLoan_THROW(shortTx, shortTx.loanOffering.payer,shortTx.loanOffering.payer);
    });

    it('transfers ownership of a loan', async () => {
      const tx = await transferLoan(shortTx, toAddress, shortTx.loanOffering.payer);
      console.log('\tMargin.transferLoan gas used: ' + tx.receipt.gasUsed);
    });

    it('fails if already transferred', async () => {
      await transferLoan_THROW(shortTx, toAddress, shortTx.loanOffering.payer);
    });

    it('fails for invalid id', async () => {
      await transferLoan_THROW({id: BYTES32.BAD_ID}, toAddress, shortTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract with the correct interface', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);

      const tx =
        await transferLoan(shortTx, testCallLoanDelegator.address, shortTx.loanOffering.payer);
      const { lender } = await getShort(dydxMargin, shortTx.id);
      expect(lender.toLowerCase()).to.eq(testCallLoanDelegator.address.toLowerCase());
      console.log('\tMargin.transferLoan gas used (to contract): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('successfully transfers to a contract that chains to another contract', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testLoanOwner = await TestLoanOwner.new(
        dydxMargin.address,
        testCallLoanDelegator.address,
        false);

      const tx = await transferLoan(
        shortTx,
        testLoanOwner.address,
        shortTx.loanOffering.payer,
        testCallLoanDelegator.address);
      console.log('\tMargin.transferLoan gas used (chain thru): ' + tx.receipt.gasUsed);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers to 0x0', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      const testLoanOwner = await TestLoanOwner.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        false);

      await transferLoan_THROW(shortTx, testLoanOwner.address, shortTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to a contract that transfers back to original owner', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      const testLoanOwner = await TestLoanOwner.new(
        dydxMargin.address,
        shortTx.loanOffering.payer,
        false);

      await transferLoan_THROW(shortTx, testLoanOwner.address, shortTx.loanOffering.payer);
    });
  });

  contract('Margin', function(accounts) {
    it('fails to transfer to an arbitrary contract', async () => {
      dydxMargin = await Margin.deployed();
      shortTx = await doShort(accounts);
      await transferLoan_THROW(shortTx, TokenA.address, shortTx.loanOffering.payer);
    });
  });
});
