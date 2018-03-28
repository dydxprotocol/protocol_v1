/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const ProxyContract = artifacts.require("Proxy");

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
      const [shortSell, baseToken] = await Promise.all([
        ShortSell.deployed(),
        BaseToken.deployed()
      ]);

      await baseToken.issueTo(shortTx.seller, shortTx.depositAmount);
      await baseToken.approve(
        ProxyContract.address,
        shortTx.depositAmount,
        { from: shortTx.seller }
      );

      const tx = await callAddValueToShort(shortSell, shortTx);

      console.log(
        '\tShortSell.addValueToShort (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed
      );

      expect(true).to.be.false;
    });
  });
});
