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
  let margin;
  let additionalSalt = 888;

  async function getNewLoanOffering(accounts) {
    let loanOffering = await createLoanOffering(accounts);
    loanOffering.salt += (additionalSalt++);
    loanOffering.signature = await signLoanOffering(loanOffering);
    return loanOffering;
  }

  contract('Margin', function(accounts) {
    before('get margin', async () => {
      margin = await Margin.deployed();
    });

    it('approves a loan offering', async () => {
      const loanOffering = await getNewLoanOffering(accounts);

      const tx = await callApproveLoanOffering(margin, loanOffering);

      console.log('\tMargin.cancelLoanOffering gas used: ' + tx.receipt.gasUsed);
    });

    it('succeeds without event if already approved', async () => {
      const loanOffering = await getNewLoanOffering(accounts);

      await callApproveLoanOffering(margin, loanOffering);

      await callApproveLoanOffering(margin, loanOffering);
    });

    it('fails if not approved by the payer', async () => {
      const loanOffering = await getNewLoanOffering(accounts);

      await expectThrow(
        callApproveLoanOffering(
          margin,
          loanOffering,
          accounts[9])
      );
    });

    it('does not approve if past expirationTimestamp anyway', async () => {
      const loanOffering = await getNewLoanOffering(accounts);

      const tx = await callApproveLoanOffering(margin, loanOffering);
      const now = await getBlockTimestamp(tx.receipt.blockNumber);

      // Test unexpired loan offering
      let loanOfferingGood = Object.assign({}, loanOffering);
      loanOfferingGood.expirationTimestamp = new BigNumber(now).plus(1000);
      loanOfferingGood.signature = await signLoanOffering(loanOfferingGood);
      await callApproveLoanOffering(
        margin,
        loanOfferingGood
      );

      // Test expired loan offering
      let loanOfferingBad = Object.assign({}, loanOffering);
      loanOfferingBad.expirationTimestamp = new BigNumber(now);
      loanOfferingBad.signature = await signLoanOffering(loanOfferingBad);
      await expectThrow( callApproveLoanOffering(
        margin,
        loanOfferingBad
      ));
    });
  });
});
