/*global artifacts, contract, describe, before, it*/

const chai = require('chai');
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const { expectThrow } = require('../helpers/ExpectHelper');
const { createLoanOffering, signLoanOffering} = require('../helpers/LoanHelper');
const { getBlockTimestamp } = require('../helpers/NodeHelper');
const { callCancelLoanOffer } = require('../helpers/MarginHelper');

describe('#cancelLoanOffering', () => {
  let dydxMargin;
  let additionalSalt = 888;

  async function getNewLoanOffering(accounts) {
    let loanOffering = await createLoanOffering(accounts);
    loanOffering.salt += (additionalSalt++);
    loanOffering.signature = await signLoanOffering(loanOffering);
    return loanOffering;
  }

  contract('Margin', function(accounts) {
    before('get dydxMargin', async () => {
      dydxMargin = await Margin.deployed();
    });

    it('cancels an amount of a loan offering', async () => {
      const loanOffering = await getNewLoanOffering(accounts);
      const cancelAmount = new BigNumber(1000);

      const tx = await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount);

      console.log('\tMargin.cancelLoanOffering gas used: ' + tx.receipt.gasUsed);
    });

    it('increments canceled amount if already partially canceled', async () => {
      const loanOffering = await getNewLoanOffering(accounts);
      const cancelAmount = new BigNumber(1000);
      const cancelAmount2 = new BigNumber(2000);

      await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount);

      await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount2);
    });

    it('only cancels up to the maximum amount', async () => {
      const loanOffering = await getNewLoanOffering(accounts);
      const cancelAmount = loanOffering.rates.maxAmount.times(2).div(3).floor();

      await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount);

      await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount);
    });

    it('only allows the lender to cancel', async () => {
      const loanOffering = await getNewLoanOffering(accounts);

      await expectThrow(
        callCancelLoanOffer(
          dydxMargin,
          loanOffering,
          loanOffering.rates.maxAmount,
          accounts[9])
      );
    });

    it('does not cancel if past expirationTimestamp anyway', async () => {
      const loanOffering = await getNewLoanOffering(accounts);
      const cancelAmount = loanOffering.rates.maxAmount.div(4);

      const tx = await callCancelLoanOffer(
        dydxMargin,
        loanOffering,
        cancelAmount
      );

      const now = await getBlockTimestamp(tx.receipt.blockNumber);

      // Test unexpired loan offering
      let loanOfferingGood = Object.assign({}, loanOffering);
      loanOfferingGood.expirationTimestamp = new BigNumber(now).plus(1000);
      loanOfferingGood.signature = await signLoanOffering(loanOfferingGood);
      await callCancelLoanOffer(
        dydxMargin,
        loanOfferingGood,
        cancelAmount
      );

      // Test expired loan offering
      let loanOfferingBad = Object.assign({}, loanOffering);
      loanOfferingBad.expirationTimestamp = new BigNumber(now);
      loanOfferingBad.signature = await signLoanOffering(loanOfferingBad);
      await expectThrow(callCancelLoanOffer(
        dydxMargin,
        loanOfferingBad,
        cancelAmount
      ));

    });
  });
});
