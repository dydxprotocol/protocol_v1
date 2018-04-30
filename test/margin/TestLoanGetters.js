/*global artifacts, contract, describe, before, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const { BYTES32 } = require('../helpers/Constants');
const {
  createOpenTx,
  callApproveLoanOffering,
  callOpenPosition,
  callIncreasePosition,
  callCancelLoanOffer,
  issueTokenToAccountInAmountAndApproveProxy,
  issueTokensAndSetAllowances
} = require('../helpers/MarginHelper');
const { createLoanOffering, signLoanOffering } = require('../helpers/LoanHelper');

contract('LoanGetters', (accounts) => {
  let dydxMargin;

  async function expectLoanAmounts(loanHash, expectedFilledAmount, expectedCanceledAmount){
    const [
      unavailableAmount,
      filledAmount,
      canceledAmount
    ] = await Promise.all([
      dydxMargin.getLoanUnavailableAmount.call(loanHash),
      dydxMargin.getLoanFilledAmount.call(loanHash),
      dydxMargin.getLoanCanceledAmount.call(loanHash)
    ]);

    expect(unavailableAmount).to.be.bignumber.equal(filledAmount.plus(canceledAmount));
    expect(filledAmount).to.be.bignumber.equal(expectedFilledAmount);
    expect(canceledAmount).to.be.bignumber.equal(expectedCanceledAmount);
  }

  before('get Margin', async() => {
    dydxMargin = await Margin.deployed();
  });

  describe('#getLoanUnavailableAmount, getLoanFilledAmount, #getLoanCanceledAmount', () => {
    it('succeeds for all', async () => {
      const ca1 = new BigNumber("1e17");
      const ca2 = new BigNumber("1e16");
      let openTx = await createOpenTx(accounts);
      openTx.principal = openTx.principal.div(2);

      await expectLoanAmounts(openTx.loanOffering.loanHash, 0, 0);

      await callCancelLoanOffer(dydxMargin, openTx.loanOffering, ca1);
      await expectLoanAmounts(openTx.loanOffering.loanHash, 0, ca1);

      await issueTokensAndSetAllowances(openTx);
      await callOpenPosition(dydxMargin, openTx);
      await expectLoanAmounts(openTx.loanOffering.loanHash, openTx.principal, ca1);

      await callCancelLoanOffer(dydxMargin, openTx.loanOffering, ca2);
      await expectLoanAmounts(openTx.loanOffering.loanHash, openTx.principal, ca1.plus(ca2));

      await issueTokensAndSetAllowances(openTx);
      await callOpenPosition(dydxMargin, openTx);
      await expectLoanAmounts(
        openTx.loanOffering.loanHash,
        openTx.principal.times(2),
        ca1.plus(ca2)
      );
    });
  });
});

contract('LoanGetters', (accounts) => {
  let dydxMargin, heldToken;

  before('get Margin', async() => {
    [dydxMargin, heldToken] = await Promise.all([
      Margin.deployed(),
      HeldToken.deployed(),
    ]);
  });

  describe('#getLoanUniquePositions', () => {
    it('succeeds', async () => {
      let lup;
      let openTx = await createOpenTx(accounts);
      const loanHash = openTx.loanOffering.loanHash;
      let incrTx = await createOpenTx(accounts, 9999);
      openTx.principal = openTx.principal.div(4);
      incrTx.loanOffering.rates.minHeldToken = new BigNumber(0);
      incrTx.loanOffering.signature = await signLoanOffering(incrTx.loanOffering);

      // expect 0 to start
      lup = await dydxMargin.getLoanUniquePositions.call(loanHash);
      expect(lup).to.be.bignumber.equal(0);

      // expect 1 after opening once
      await issueTokensAndSetAllowances(openTx);
      const openTxResult = await callOpenPosition(dydxMargin, openTx);
      lup = await dydxMargin.getLoanUniquePositions.call(loanHash);
      expect(lup).to.be.bignumber.equal(1);

      // expect 1 for original loanOffering, expect 0 for loanOffering used to increase
      incrTx.id = openTxResult.id;
      await issueTokenToAccountInAmountAndApproveProxy(
        heldToken,
        incrTx.trader,
        incrTx.depositAmount.times(4)
      );
      await callIncreasePosition(dydxMargin, incrTx);
      lup = await dydxMargin.getLoanUniquePositions.call(loanHash);
      expect(lup).to.be.bignumber.equal(1);
      lup = await dydxMargin.getLoanUniquePositions.call(incrTx.loanOffering.loanHash);
      expect(lup).to.be.bignumber.equal(0);

      // expect 2 after opening a second time
      await issueTokensAndSetAllowances(openTx);
      await callOpenPosition(dydxMargin, openTx);
      lup = await dydxMargin.getLoanUniquePositions.call(loanHash);
      expect(lup).to.be.bignumber.equal(2);
    });
  });
});

contract('LoanGetters', (accounts) => {
  let dydxMargin;

  before('get Margin', async () => {
    dydxMargin = await Margin.deployed();
  });

  describe('#isLoanApproved', () => {
    it('succeeds', async () => {
      const loanOffering = await createLoanOffering(accounts);
      const loanHash = loanOffering.loanHash;
      let approved;

      approved = await dydxMargin.isLoanApproved.call(loanHash);
      expect(approved).to.be.false;

      await callApproveLoanOffering(dydxMargin, loanOffering);

      approved = await dydxMargin.isLoanApproved.call(loanHash);
      expect(approved).to.be.true;

      approved = await dydxMargin.isLoanApproved.call(BYTES32.TEST[0]);
      expect(approved).to.be.false;
    });
  });
});
