const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const { BYTES32 } = require('../helpers/Constants');
const {
  createOpenTx,
  callApproveLoanOffering,
  callOpenPosition,
  callCancelLoanOffer,
  issueTokensAndSetAllowances
} = require('../helpers/MarginHelper');
const { createLoanOffering } = require('../helpers/LoanHelper');

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

  before('get Margin', async () => {
    dydxMargin = await Margin.deployed();
  });

  describe('#getLoanUnavailableAmount, getLoanFilledAmount, #getLoanCanceledAmount', () => {
    it('succeeds for all', async () => {
      const ca1 = new BigNumber("1e17");
      const ca2 = new BigNumber("1e16");
      let openTx = await createOpenTx(accounts);
      openTx.principal = openTx.principal.div(2).floor();

      await expectLoanAmounts(openTx.loanOffering.loanHash, 0, 0);

      await callCancelLoanOffer(dydxMargin, openTx.loanOffering, ca1);
      await expectLoanAmounts(openTx.loanOffering.loanHash, 0, ca1);

      await issueTokensAndSetAllowances(openTx);
      await callOpenPosition(dydxMargin, openTx);
      await expectLoanAmounts(openTx.loanOffering.loanHash, openTx.principal, ca1);

      await callCancelLoanOffer(dydxMargin, openTx.loanOffering, ca2);
      await expectLoanAmounts(openTx.loanOffering.loanHash, openTx.principal, ca1.plus(ca2));

      await issueTokensAndSetAllowances(openTx);
      openTx.nonce = 2;
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

      await callApproveLoanOffering(dydxMargin, loanOffering, loanOffering.signer);

      approved = await dydxMargin.isLoanApproved.call(loanHash);
      expect(approved).to.be.true;

      approved = await dydxMargin.isLoanApproved.call(BYTES32.TEST[0]);
      expect(approved).to.be.false;
    });
  });
});
