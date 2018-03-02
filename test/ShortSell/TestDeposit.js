/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require('TokenA');
const ProxyContract = artifacts.require('Proxy');
const {
  doShort,
  doShortAndCall,
  getShort
} = require('../helpers/ShortSellHelper');

describe('#deposit', () => {
  contract('ShortSell', function(accounts) {
    it('deposits additional funds into the short position', async () => {
      const [shortSell, baseToken] = await Promise.all([
        ShortSell.deployed(),
        BaseToken.deployed()
      ]);
      const shortTx = await doShort(accounts);

      await doDeposit({
        from: shortTx.seller,
        shortSell,
        shortTx,
        baseToken,
        printGas: true,
      });
    });
  });

  contract('ShortSell', function(accounts) {
    it('allows anyone to deposit', async () => {
      const [shortSell, baseToken] = await Promise.all([
        ShortSell.deployed(),
        BaseToken.deployed()
      ]);
      const shortTx = await doShort(accounts);

      await doDeposit({
        from: accounts[0],
        shortSell,
        shortTx,
        baseToken,
      });
    });
  });

  contract('ShortSell', function(accounts) {
    it.only('allows anyone to deposit', async () => {
      const [shortSell, baseToken] = await Promise.all([
        ShortSell.deployed(),
        BaseToken.deployed()
      ]);
      const { shortTx } = await doShortAndCall(accounts);

      let { requiredDeposit } = await getShort(shortSell, shortTx.id);

      await doDeposit({
        from: accounts[0],
        shortSell,
        shortTx,
        baseToken,
        amount: requiredDeposit.minus(5)
      });

      let short = await getShort(shortSell, shortTx.id);
      requiredDeposit = short.requiredDeposit;
      let callTimestamp = short.callTimestamp;
      expect(requiredDeposit).to.be.bignumber.eq(5);
      expect(callTimestamp).to.be.bignumber.gt(new BigNumber(0));

      await doDeposit({
        from: accounts[0],
        shortSell,
        shortTx,
        baseToken,
        amount: 5
      });

      short = await getShort(shortSell, shortTx.id);
      requiredDeposit = short.requiredDeposit;
      callTimestamp = short.callTimestamp;
      expect(requiredDeposit).to.be.bignumber.eq(0);
      expect(callTimestamp).to.be.bignumber.eq(0);
    });
  });
});

async function doDeposit({
  from,
  shortSell,
  shortTx,
  baseToken,
  printGas = false,
  amount = new BigNumber(1000)
}) {
  const initialBalance = await shortSell.getShortBalance.call(shortTx.id);
  await baseToken.issue(amount, { from });
  await baseToken.approve(ProxyContract.address, amount, { from });

  const tx = await shortSell.deposit(
    shortTx.id,
    amount,
    { from }
  );

  if (printGas) {
    console.log('\tShortSell.deposit gas used: ' + tx.receipt.gasUsed);
  }

  const newBalance = await shortSell.getShortBalance.call(shortTx.id);

  expect(newBalance).to.be.bignumber.equal(initialBalance.plus(amount));
}
