const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const { expectThrow } = require('../../helpers/ExpectHelper');
const { createLoanOffering, signLoanOffering} = require('../../helpers/LoanHelper');
const { getBlockTimestamp } = require('../../helpers/NodeHelper');
const { callCancelLoanOffer } = require('../../helpers/MarginHelper');

describe('#cancelLoanOffering', () => {
  let additionalSalt = 888;

  async function getNewLoanOffering(accounts) {
    let loanOffering = await createLoanOffering(accounts);
    loanOffering.salt += (additionalSalt++);
    loanOffering.signature = await signLoanOffering(loanOffering);
    return loanOffering;
  }

  async function expectCancelAmount(dydxMargin, loanOffering, cancelAmount) {
    const [unavailableAmount, canceledAmount] = await Promise.all([
      dydxMargin.getLoanUnavailableAmount.call(loanOffering.loanHash),
      dydxMargin.getLoanCanceledAmount.call(loanOffering.loanHash)
    ]);

    expect(unavailableAmount).to.be.bignumber.eq(cancelAmount);
    expect(canceledAmount).to.be.bignumber.eq(cancelAmount);
  }

  contract('Margin', accounts => {
    it('cancels an amount of a loan offering', async () => {
      const [dydxMargin, loanOffering] = await Promise.all([
        Margin.deployed(),
        getNewLoanOffering(accounts)
      ]);

      const cancelAmount = new BigNumber(1000);

      const tx = await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount);

      console.log('\tMargin.cancelLoanOffering gas used: ' + tx.receipt.gasUsed);

      await expectCancelAmount(dydxMargin, loanOffering, cancelAmount);
    });
  });

  contract('Margin', accounts => {
    it('increments canceled amount if already partially canceled', async () => {
      const [dydxMargin, loanOffering] = await Promise.all([
        Margin.deployed(),
        getNewLoanOffering(accounts)
      ]);

      const cancelAmount = new BigNumber(1000);
      const cancelAmount2 = new BigNumber(2000);

      await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount);
      await expectCancelAmount(dydxMargin, loanOffering, cancelAmount);

      await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount2);

      const totalCanceled = cancelAmount.plus(cancelAmount2);

      await expectCancelAmount(dydxMargin, loanOffering, totalCanceled);
    });
  });

  contract('Margin', accounts => {
    it('only cancels up to the maximum amount', async () => {
      const [dydxMargin, loanOffering] = await Promise.all([
        Margin.deployed(),
        getNewLoanOffering(accounts)
      ]);

      const cancelAmount = loanOffering.rates.maxAmount.times(2).div(3).floor();

      await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount);
      await expectCancelAmount(dydxMargin, loanOffering, cancelAmount);

      await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount);
      await expectCancelAmount(dydxMargin, loanOffering, loanOffering.rates.maxAmount);
    });
  });

  contract('Margin', accounts => {
    it('only allows the lender to cancel', async () => {
      const [dydxMargin, loanOffering] = await Promise.all([
        Margin.deployed(),
        getNewLoanOffering(accounts)
      ]);

      await expectThrow(
        callCancelLoanOffer(
          dydxMargin,
          loanOffering,
          loanOffering.rates.maxAmount,
          accounts[9])
      );

      await expectCancelAmount(dydxMargin, loanOffering, 0);
    });
  });

  contract('Margin', accounts => {
    it('does not cancel if past expirationTimestamp anyway', async () => {
      const [dydxMargin, loanOffering] = await Promise.all([
        Margin.deployed(),
        getNewLoanOffering(accounts)
      ]);

      const cancelAmount = loanOffering.rates.maxAmount.div(4).floor();

      const tx = await callCancelLoanOffer(
        dydxMargin,
        loanOffering,
        cancelAmount
      );
      await expectCancelAmount(dydxMargin, loanOffering, cancelAmount);

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

      await expectCancelAmount(dydxMargin, loanOfferingGood, cancelAmount);

      // Test expired loan offering
      let loanOfferingBad = Object.assign({}, loanOffering);
      loanOfferingBad.expirationTimestamp = new BigNumber(now);
      loanOfferingBad.signature = await signLoanOffering(loanOfferingBad);
      await expectThrow(callCancelLoanOffer(
        dydxMargin,
        loanOfferingBad,
        cancelAmount
      ));

      await expectCancelAmount(dydxMargin, loanOfferingBad, 0);
    });
  });

  contract('Margin', accounts => {
    it('does nothing if loan offering has already been fully canceled', async () => {
      const [dydxMargin, loanOffering] = await Promise.all([
        Margin.deployed(),
        getNewLoanOffering(accounts)
      ]);

      const cancelAmount = loanOffering.rates.maxAmount.times(2);

      await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount);
      await expectCancelAmount(dydxMargin, loanOffering, loanOffering.rates.maxAmount);

      await callCancelLoanOffer(dydxMargin, loanOffering, cancelAmount);
      await expectCancelAmount(dydxMargin, loanOffering, loanOffering.rates.maxAmount);
    });
  });

  contract('Margin', accounts => {
    it('canceling 0 does nothing', async () => {
      const [dydxMargin, loanOffering] = await Promise.all([
        Margin.deployed(),
        getNewLoanOffering(accounts)
      ]);

      await callCancelLoanOffer(dydxMargin, loanOffering, 0);
      await expectCancelAmount(dydxMargin, loanOffering, 0);
    });
  });
});
