/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require('TokenA');
const ProxyContract = artifacts.require('Proxy');
const {
  doShort
} = require('../helpers/ShortSellHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

describe('#deposit', () => {
  contract('ShortSell', function(accounts) {
    it('deposits additional funds into the short position', async () => {
      const [shortSell, baseToken] = await Promise.all([
        ShortSell.deployed(),
        BaseToken.deployed()
      ]);
      const shortTx = await doShort(accounts);
      const amount = new BigNumber(1000);
      const initialBalance = await shortSell.getShortBalance.call(shortTx.id);
      await baseToken.issue(amount, { from: shortTx.seller });
      await baseToken.approve(ProxyContract.address, amount, { from: shortTx.seller });

      const tx = await shortSell.deposit(
        shortTx.id,
        amount,
        { from: shortTx.seller }
      );
      console.log('\tShortSell.deposit gas used: ' + tx.receipt.gasUsed);

      const newBalance = await shortSell.getShortBalance.call(shortTx.id);

      expect(newBalance).to.be.bignumber.equal(initialBalance.plus(amount));
    });
  });

  contract('ShortSell', function(accounts) {
    it('only allows the short seller to deposit', async () => {
      const [shortSell, baseToken] = await Promise.all([
        ShortSell.deployed(),
        BaseToken.deployed()
      ]);
      const shortTx = await doShort(accounts);
      const depositer = accounts[6];
      const amount = new BigNumber(1000);
      await baseToken.issue(amount, { from: depositer });
      await baseToken.approve(ProxyContract.address, amount, { from: depositer });

      await expectThrow( () => shortSell.deposit(
        shortTx.id,
        amount,
        { from: depositer }
      ));
    });
  });
});
