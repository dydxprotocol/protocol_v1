/*global artifacts, contract, describe, it*/

const chai = require('chai');
chai.use(require('chai-bignumber')());

const ShortSell = artifacts.require("ShortSell");
const {
  createShortSellTx,
  callApproveLoanOffering
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

describe('#approveLoanOffering', () => {
  contract('ShortSell', function(accounts) {
    it('approves a loan offering', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);

      const tx = await callApproveLoanOffering(shortSell, shortTx.loanOffering);

      console.log('\tShortSell.cancelLoanOffering gas used: ' + tx.receipt.gasUsed);
    });
  });

  contract('ShortSell', function(accounts) {
    it('fails if already approved', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);

      await callApproveLoanOffering(shortSell, shortTx.loanOffering);

      await expectThrow(() => callApproveLoanOffering(shortSell, shortTx.loanOffering));
    });
  });

  contract('ShortSell', function(accounts) {
    it('fails if not approved by the payer', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);

      await expectThrow(() =>
        callApproveLoanOffering(
          shortSell,
          shortTx.loanOffering,
          accounts[9])
      );
    });
  });

  //TODO: when we can roll-back evm time after this super long wait
  /*
  contract('ShortSell', function(_accounts) {
    it('does not approve if past expirationTimestamp anyway', async () => {
    });
  });
  */
});
