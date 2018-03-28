/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ShortSell = artifacts.require("ShortSell");

const {
  doShort,
  getShort,
  issueTokensAndSetAllowancesForShort,
  callAddValueToShort
} = require('../helpers/ShortSellHelper');

describe('#addValueToShort', () => {
  contract('ShortSell', function(accounts) {
    it.only('succeeds on valid inputs', async () => {
      const shortTx = await doShort(accounts);
      const shortSell = await ShortSell.deployed();

      const tx = await callAddValueToShort(shortSell, shortTx);

      console.log(
        '\tShortSell.addValueToShort (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed
      );

      console.log(shortTx.loanOffering);

      expect(true).to.be.false;
    });
  });
});
