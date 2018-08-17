const { reset, snapshot } = require('../../../src/index');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const TokenA = artifacts.require('TokenA');

contract('Margin', accounts => {
  after(async () => {
    // Reset to the initial snapshot into reverting to this in the contract block
    await reset(web3.currentProvider, '0x1');
  });

  describe('#reset', () => {
    it('resets any transactions made', async () => {
      const id = await snapshot(web3.currentProvider);
      const account = accounts[5];
      const amount = new BigNumber(123456);
      const token = await TokenA.deployed();

      const startingBalance = await token.balanceOf.call(account);
      await token.issueTo(account, amount);
      const afterBalance = await token.balanceOf.call(account);

      expect(afterBalance).to.be.bignumber.eq(startingBalance.plus(amount));

      await reset(web3.currentProvider, id);

      const balanceAfterReset = await token.balanceOf.call(account);
      expect(balanceAfterReset).to.be.bignumber.eq(startingBalance);
    });

    it('works multiple times', async () => {
      const id = await snapshot(web3.currentProvider);
      const account = accounts[5];
      const amount = new BigNumber(123456);
      const token = await TokenA.deployed();

      const startingBalance = await token.balanceOf.call(account);
      await token.issueTo(account, amount);
      const afterBalance = await token.balanceOf.call(account);

      expect(afterBalance).to.be.bignumber.eq(startingBalance.plus(amount));

      await reset(web3.currentProvider, id);

      let balanceAfterReset = await token.balanceOf.call(account);
      expect(balanceAfterReset).to.be.bignumber.eq(startingBalance);

      await token.issueTo(account, amount);

      await reset(web3.currentProvider, id);

      balanceAfterReset = await token.balanceOf.call(account);
      expect(balanceAfterReset).to.be.bignumber.eq(startingBalance);
    });
  });
});
