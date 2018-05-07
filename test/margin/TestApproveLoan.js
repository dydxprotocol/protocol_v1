/*global artifacts, contract, describe, before, it*/

const chai = require('chai');
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const { expectThrow } = require('../helpers/ExpectHelper');
const { createLoanOffering, signLoanOffering} = require('../helpers/LoanHelper');
const { getBlockTimestamp } = require('../helpers/NodeHelper');
const { callApproveLoanOffering } = require('../helpers/MarginHelper');

describe('#approveLoanOffering', () => {
  let dydxMargin;
  let additionalSalt = 888;
  let defaultSigner;

  async function getNewLoanOffering(accounts) {
    let loanOffering = await createLoanOffering(accounts);
    loanOffering.salt += (additionalSalt++);
    loanOffering.signature = await signLoanOffering(loanOffering);
    return loanOffering;
  }

  contract('Margin', accounts => {
    before('get dydxMargin', async () => {
      dydxMargin = await Margin.deployed();
      defaultSigner = accounts[1];
    });

    it('approves a loan offering', async () => {
      const loanOffering = await getNewLoanOffering(accounts);

      const tx = await callApproveLoanOffering(dydxMargin, loanOffering, defaultSigner);

      console.log('\tMargin.cancelLoanOffering gas used: ' + tx.receipt.gasUsed);
    });

    it('succeeds without event if already approved', async () => {
      const loanOffering = await getNewLoanOffering(accounts);

      await callApproveLoanOffering(dydxMargin, loanOffering, defaultSigner);

      await callApproveLoanOffering(dydxMargin, loanOffering, defaultSigner);
    });

    it('fails if not approved by the signer', async () => {
      const loanOffering = await getNewLoanOffering(accounts);
      const newSigner = accounts[9];
      loanOffering.signer = newSigner;
      loanOffering.signature = await signLoanOffering(loanOffering);

      await expectThrow(
        callApproveLoanOffering(dydxMargin, loanOffering, defaultSigner)
      );

      // make sure it still works and doesn't throw for a different reason
      await callApproveLoanOffering(dydxMargin, loanOffering, newSigner);
    });

    it('does not approve if past expirationTimestamp anyway', async () => {
      const loanOffering = await getNewLoanOffering(accounts);

      const tx = await callApproveLoanOffering(dydxMargin, loanOffering, defaultSigner);
      const now = await getBlockTimestamp(tx.receipt.blockNumber);

      // Test unexpired loan offering
      let loanOfferingGood = Object.assign({}, loanOffering);
      loanOfferingGood.expirationTimestamp = new BigNumber(now).plus(1000);
      loanOfferingGood.signature = await signLoanOffering(loanOfferingGood);
      await callApproveLoanOffering(
        dydxMargin,
        loanOfferingGood,
        defaultSigner
      );

      // Test expired loan offering
      let loanOfferingBad = Object.assign({}, loanOffering);
      loanOfferingBad.expirationTimestamp = new BigNumber(now);
      loanOfferingBad.signature = await signLoanOffering(loanOfferingBad);
      await expectThrow(callApproveLoanOffering(
        dydxMargin,
        loanOfferingBad,
        defaultSigner
      ));
    });
  });
});
