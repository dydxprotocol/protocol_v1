const { reset, snapshot } = require('../../../src/index');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const TokenA = artifacts.require('TokenA');

contract('Margin', accounts => {
  after(async () => {
    await reset(web3.currentProvider);
    // Snapshot a final time to fool truffle into reverting to this in the contract block
    await snapshot(web3.currentProvider);
  });

  describe('#reset', () => {
    it('resets any transactions made', async () => {
      const account = accounts[5];
      const amount = new BigNumber(123456);
      const token = await TokenA.deployed();

      const startingBalance = await token.balanceOf.call(account);
      await token.issueTo(account, amount);
      const afterBalance = await token.balanceOf.call(account);

      expect(afterBalance).to.be.bignumber.eq(startingBalance.plus(amount));

      await reset(web3.currentProvider);

      const balanceAfterReset = await token.balanceOf.call(account);
      expect(balanceAfterReset).to.be.bignumber.eq(startingBalance);
    });

    it('works multiple times', async () => {
      const account = accounts[5];
      const amount = new BigNumber(123456);
      const token = await TokenA.deployed();

      const startingBalance = await token.balanceOf.call(account);
      await token.issueTo(account, amount);
      const afterBalance = await token.balanceOf.call(account);

      expect(afterBalance).to.be.bignumber.eq(startingBalance.plus(amount));

      await reset(web3.currentProvider);

      let balanceAfterReset = await token.balanceOf.call(account);
      expect(balanceAfterReset).to.be.bignumber.eq(startingBalance);

      await token.issueTo(account, amount);

      await reset(web3.currentProvider);

      balanceAfterReset = await token.balanceOf.call(account);
      expect(balanceAfterReset).to.be.bignumber.eq(startingBalance);
    });
  });
});
