/*global artifacts, contract, describe, it*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const {
  createShortSellTx,
  callCancelLoanOffer
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

describe('#cancelLoanOffering', () => {
  contract('ShortSell', function(accounts) {
    it('cancels an amount of a loan offering', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);
      const cancelAmount = new BigNumber(1000);

      const tx = await callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        cancelAmount
      );
      console.log('\tShortSell.cancelLoanOffering gas used: ' + tx.receipt.gasUsed);

      const canceledAmount = await shortSell.loanCancels.call(shortTx.loanOffering.loanHash);

      expect(canceledAmount.equals(cancelAmount)).to.be.true;
    });
  });

  contract('ShortSell', function(accounts) {
    it('increments canceled amount if already partially canceled', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);
      const cancelAmount = new BigNumber(1000);
      const cancelAmount2 = new BigNumber(2000);

      await callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        cancelAmount
      );
      await callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        cancelAmount2
      );

      const canceledAmount = await shortSell.loanCancels.call(shortTx.loanOffering.loanHash);

      expect(canceledAmount.equals(cancelAmount.plus(cancelAmount2))).to.be.true;
    });
  });

  contract('ShortSell', function(accounts) {
    it('only cancels up to the maximum amount', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);

      await callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        shortTx.loanOffering.rates.maxAmount
      );
      await callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        shortTx.loanOffering.rates.maxAmount
      );

      const canceledAmount = await shortSell.loanCancels.call(shortTx.loanOffering.loanHash);

      expect(canceledAmount.equals(shortTx.loanOffering.rates.maxAmount)).to.be.true;
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the lender to cancel', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);

      await expectThrow( () => callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        shortTx.loanOffering.rates.maxAmount,
        accounts[6]
      ));

      const canceledAmount = await shortSell.loanCancels.call(shortTx.loanOffering.loanHash);

      expect(canceledAmount.equals(new BigNumber(0))).to.be.true;
    });
  });
});
