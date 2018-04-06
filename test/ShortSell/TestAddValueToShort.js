/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const { wait } = require('@digix/tempo')(web3);

const ShortSell = artifacts.require("ShortSell");
const QuoteToken = artifacts.require("TokenA");
const ProxyContract = artifacts.require("Proxy");

const {
  doShort,
  getShort,
  callAddValueToShort,
  createShortSellTx
} = require('../helpers/ShortSellHelper');

let salt = 200;

describe('#addValueToShort', () => {
  contract('ShortSell', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const shortTx = await doShort(accounts);
      const [shortSell, quoteToken] = await Promise.all([
        ShortSell.deployed(),
        QuoteToken.deployed()
      ]);

      const addValueTx = await createShortSellTx(accounts, salt++);

      await quoteToken.issueTo(shortTx.seller, shortTx.depositAmount);
      await quoteToken.approve(
        ProxyContract.address,
        shortTx.depositAmount,
        { from: shortTx.seller }
      );

      await wait(1000);

      shortTx.shortAmount = shortTx.shortAmount.div(2);
      const tx = await callAddValueToShort(shortSell, shortTx);

      console.log(
        '\tShortSell.addValueToShort (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed
      );

      const short = await getShort(shortSell, shortTx.id);

      expect(short.shortAmount).to.be.bignumber.eq(
        shortTx.shortAmount.times(3)
      );
    });
  });
});
