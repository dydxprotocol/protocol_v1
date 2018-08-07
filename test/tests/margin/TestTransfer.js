const expect = require('chai').expect;

const Margin = artifacts.require("Margin");
const TestClosePositionDelegator = artifacts.require("TestClosePositionDelegator");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const TestMarginCallDelegator = artifacts.require("TestMarginCallDelegator");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const { doOpenPosition } = require('../../helpers/MarginHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');
const { expectLog } = require('../../helpers/EventHelper');
const { ADDRESSES, BYTES32 } = require('../../helpers/Constants');

let salt = 102030;

describe('#transferPosition', () => {
  let dydxMargin, openTx, owner;

  async function transferPosition_THROW(openTx, to, from) {
    const originalOwner = await dydxMargin.getPositionOwner.call(openTx.id);
    await expectThrow(
      dydxMargin.transferPosition(openTx.id, to, { from: from })
    );
    const currentOwner = await dydxMargin.getPositionOwner.call(openTx.id);
    expect(currentOwner).to.eq(originalOwner);
    return;
  }

  async function transferPosition(openTx, to, from, expectedOwner = null) {
    expectedOwner = expectedOwner || to;
    const tx = await dydxMargin.transferPosition(openTx.id, to, { from: from});

    if (expectedOwner === to) {
      expectLog(tx.logs[0], 'PositionTransferred', {
        positionId: openTx.id,
        from: from,
        to: to
      });
    } else {
      expectLog(tx.logs[0], 'PositionTransferred', {
        positionId: openTx.id,
        from: from,
        to: to
      });
      expectLog(tx.logs[1], 'PositionTransferred', {
        positionId: openTx.id,
        from: to,
        to: expectedOwner
      });
    }

    const currentOwner = await dydxMargin.getPositionOwner.call(openTx.id);
    expect(currentOwner.toLowerCase()).to.eq(expectedOwner.toLowerCase());

    return tx;
  }

  contract('Margin', accounts => {
    const toAddress = accounts[9];

    beforeEach('set up a position', async () => {
      dydxMargin = await Margin.deployed();
      openTx = await doOpenPosition(accounts, { salt: salt++ });
      owner = await dydxMargin.getPositionOwner.call(openTx.id);
      expect(owner).to.not.equal(toAddress);
    });

    it('only allows position owner to transfer', async () => {
      await transferPosition_THROW(openTx, toAddress, toAddress);
    });

    it('fails if transferring to self', async () => {
      await transferPosition_THROW(openTx, owner, owner);
    });

    it('transfers ownership of a position', async () => {
      const tx = await transferPosition(openTx, toAddress, owner);
      console.log('\tMargin.transferPosition gas used: ' + tx.receipt.gasUsed);
    });

    it('fails if already transferred', async () => {
      await transferPosition(openTx, toAddress, owner);
      await transferPosition_THROW(openTx, toAddress, owner);
    });

    it('fails for invalid id', async () => {
      await transferPosition_THROW({id: BYTES32.BAD_ID}, toAddress, owner);
    });

    it('successfully transfers to a contract with the correct interface', async () => {
      dydxMargin = await Margin.deployed();
      openTx = await doOpenPosition(accounts);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        false);

      const tx = await transferPosition(
        openTx,
        testClosePositionDelegator.address,
        owner);
      console.log('\tMargin.transferPosition gas used (to contract): ' + tx.receipt.gasUsed);
    });

    it('successfully transfers to a contract that chains to another contract', async () => {
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        false);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        testClosePositionDelegator.address,
        ADDRESSES.ZERO,
        0);

      const tx = await transferPosition(
        openTx,
        testPositionOwner.address,
        owner,
        testClosePositionDelegator.address);
      console.log('\tMargin.transferPosition gas used (chains thru): ' + tx.receipt.gasUsed);
    });

    it('fails to transfer to a contract that transfers to 0x0', async () => {
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO,
        0);

      await transferPosition_THROW(openTx, testPositionOwner.address, owner);
    });

    it('fails to transfer to a contract that transfers back to original owner', async () => {
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        owner,
        ADDRESSES.ZERO,
        0);

      await transferPosition_THROW(openTx, testPositionOwner.address, owner);
    });

    it('fails to transfer to zero address', async () => {
      await transferPosition_THROW(openTx, ADDRESSES.ZERO, owner);
    });

    it('fails to transfer to an arbitrary contract', async () => {
      const [
        vaultAddress,
        proxyAddress
      ] = await Promise.all([
        dydxMargin.getVaultAddress.call(),
        dydxMargin.getTokenProxyAddress.call()
      ]);

      await transferPosition_THROW(openTx, dydxMargin.address, owner);
      await transferPosition_THROW(openTx, vaultAddress, owner);
      await transferPosition_THROW(openTx, proxyAddress, owner);
      await transferPosition_THROW(openTx, openTx.loanOffering.heldToken, owner);
      await transferPosition_THROW(openTx, openTx.loanOffering.owedToken, owner);
      await transferPosition(openTx, toAddress, owner);
    });
  });
});

describe('#transferLoan', () => {
  let dydxMargin, openTx;
  let lender;

  async function transferLoan_THROW(openTx, to, from,) {
    const originalLender = await dydxMargin.getPositionLender.call(openTx.id);
    await expectThrow(
      dydxMargin.transferLoan(openTx.id, to, { from: from })
    );
    const lender = await dydxMargin.getPositionLender.call(openTx.id);
    expect(lender).to.eq(originalLender);
    return;
  }

  async function transferLoan(openTx, to, from, expectedLender = null) {
    expectedLender = expectedLender || to;
    const tx = await dydxMargin.transferLoan(openTx.id, to, { from: from});

    if (expectedLender === to) {
      expectLog(tx.logs[0], 'LoanTransferred', {
        positionId: openTx.id,
        from: from,
        to: to
      });
    } else {
      expectLog(tx.logs[0], 'LoanTransferred', {
        positionId: openTx.id,
        from: from,
        to: to
      });
      expectLog(tx.logs[1], 'LoanTransferred', {
        positionId: openTx.id,
        from: to,
        to: expectedLender
      });
    }

    const lender = await dydxMargin.getPositionLender.call(openTx.id);
    expect(lender.toLowerCase()).to.eq((expectedLender).toLowerCase());

    return tx;
  }

  contract('Margin', accounts => {
    const toAddress = accounts[9];

    beforeEach('set up a position', async () => {
      dydxMargin = await Margin.deployed();
      openTx = await doOpenPosition(accounts, { salt: salt++ });
      lender = await dydxMargin.getPositionLender.call(openTx.id);
      expect(lender).to.not.equal(toAddress);
    });

    it('only allows position lender to transfer', async () => {
      await transferLoan_THROW(openTx, toAddress, toAddress);
    });

    it('fails if transferring to self', async () => {
      await transferLoan_THROW(openTx, lender, lender);
    });

    it('transfers ownership of a loan', async () => {
      const tx = await transferLoan(openTx, toAddress, lender);
      console.log('\tMargin.transferLoan gas used: ' + tx.receipt.gasUsed);
    });

    it('fails if already transferred', async () => {
      await transferLoan(openTx, toAddress, lender);
      await transferLoan_THROW(openTx, toAddress, lender);
    });

    it('fails for invalid id', async () => {
      await transferLoan_THROW({id: BYTES32.BAD_ID}, toAddress, lender);
    });

    it('successfully transfers to a contract with the correct interface', async () => {
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);

      const tx = await transferLoan(openTx, testMarginCallDelegator.address, lender);
      const newLender = await dydxMargin.getPositionLender.call(openTx.id);
      expect(newLender.toLowerCase()).to.eq(testMarginCallDelegator.address.toLowerCase());
      console.log('\tMargin.transferLoan gas used (to contract): ' + tx.receipt.gasUsed);
    });

    it('successfully transfers to a contract that chains to another contract', async () => {
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testLoanOwner = await TestLoanOwner.new(
        dydxMargin.address,
        testMarginCallDelegator.address,
        ADDRESSES.ZERO
      );

      const tx = await transferLoan(
        openTx,
        testLoanOwner.address,
        lender,
        testMarginCallDelegator.address);
      console.log('\tMargin.transferLoan gas used (chain thru): ' + tx.receipt.gasUsed);
    });

    it('fails to transfer to a contract that transfers to 0x0', async () => {
      const testLoanOwner = await TestLoanOwner.new(
        dydxMargin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO
      );

      await transferLoan_THROW(openTx, testLoanOwner.address, lender);
    });

    it('fails to transfer to a contract that transfers back to original owner', async () => {
      const testLoanOwner = await TestLoanOwner.new(
        dydxMargin.address,
        lender,
        ADDRESSES.ZERO
      );

      await transferLoan_THROW(openTx, testLoanOwner.address, lender);
    });

    it('fails to transfer to zero address', async () => {
      await transferLoan_THROW(openTx, ADDRESSES.ZERO, lender);
    });

    it('fails to transfer to an arbitrary contract', async () => {
      const [
        vaultAddress,
        proxyAddress
      ] = await Promise.all([
        dydxMargin.getVaultAddress.call(),
        dydxMargin.getTokenProxyAddress.call()
      ]);

      await transferLoan_THROW(openTx, dydxMargin.address, lender);
      await transferLoan_THROW(openTx, vaultAddress, lender);
      await transferLoan_THROW(openTx, proxyAddress, lender);
      await transferLoan_THROW(openTx, openTx.loanOffering.heldToken, lender);
      await transferLoan_THROW(openTx, openTx.loanOffering.owedToken, lender);
      await transferLoan(openTx, toAddress, lender);
    });
  });
});
