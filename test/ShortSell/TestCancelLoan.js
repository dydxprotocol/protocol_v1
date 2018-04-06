/*global artifacts, contract, describe, it*/

const chai = require('chai');
chai.use(require('chai-bignumber')());
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

      const tx = await callCancelLoanOffer(shortSell, shortTx.loanOffering, cancelAmount);

      console.log('\tShortSell.cancelLoanOffering gas used: ' + tx.receipt.gasUsed);
    });
  });

  contract('ShortSell', function(accounts) {
    it('increments canceled amount if already partially canceled', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);
      const cancelAmount = new BigNumber(1000);
      const cancelAmount2 = new BigNumber(2000);

      await callCancelLoanOffer(shortSell, shortTx.loanOffering, cancelAmount);

      await callCancelLoanOffer(shortSell, shortTx.loanOffering, cancelAmount2);
    });
  });

  contract('ShortSell', function(accounts) {
    it('only cancels up to the maximum amount', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);
      const cancelAmount = shortTx.loanOffering.rates.maxAmount.times(2).div(3).floor();

      await callCancelLoanOffer(shortSell, shortTx.loanOffering, cancelAmount);

      await callCancelLoanOffer(shortSell, shortTx.loanOffering, cancelAmount);
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the lender to cancel', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);

      await expectThrow(() =>
        callCancelLoanOffer(
          shortSell,
          shortTx.loanOffering,
          shortTx.loanOffering.rates.maxAmount,
          accounts[9])
      );
    });
  });

  //TODO: when we can roll-back evm time after this super long wait
  /*
  contract('ShortSell', function(_accounts) {
    it('does not cancel if past expirationTimestamp anyway', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);
      const cancelAmount = shortTx.loanOffering.rates.maxAmount.div(4);

      await callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        cancelAmount
      );
      await callCancelLoanOffer(
        shortSell,
        shortTx.loanOffering,
        cancelAmount
      );

      await wait(shortTx.loanOffering.expirationTimestamp);

      await expectThrow(() =>
        callCancelLoanOffer(
          shortSell,
          shortTx.loanOffering,
          cancelAmount
        )
      );
    });
  });
  */
});
