/*global artifacts, contract, describe, it, beforeEach*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Proxy = artifacts.require("Proxy");
const TestToken = artifacts.require("TestToken");
const { expectThrow } = require('../helpers/ExpectHelper');
const { validateStaticAccessControlledConstants } = require('../helpers/AccessControlledHelper');

contract('Proxy', function(accounts) {
  const gracePeriod = new BigNumber('1234567');
  const num1 = new BigNumber(12);
  let contract, tokenA;

  beforeEach(async () => {
    [contract, tokenA] = await Promise.all([
      Proxy.new(gracePeriod),
      TestToken.new(),
      TestToken.new()
    ]);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const owner = await contract.owner.call();
      expect(owner.toLowerCase()).to.eq(accounts[0].toLowerCase());
      validateStaticAccessControlledConstants(contract, gracePeriod);
    });
  });

  describe('#transfer', () => {
    const holder1 = accounts[4];
    it('only allows transfer authorized address to call', async () => {
      await tokenA.issue(num1, { from: holder1 });
      await tokenA.approve(contract.address, num1, { from: holder1 });
      await contract.grantAccess(accounts[1]);
      // A random address should not be able to call
      await expectThrow(
        () => contract.transfer(tokenA.address, holder1, num1, { from: accounts[3] })
      );
      // Nor should the owner
      await expectThrow(
        () => contract.transfer(tokenA.address, holder1, num1,)
      );

      const balance = await tokenA.balanceOf.call(holder1);
      expect(balance).to.be.bignumber.equal(num1);
    });

    it('fails on insufficient holder balance or allowance', async () => {
      await contract.grantAccess(accounts[2]);
      await expectThrow(
        () => contract.transfer(tokenA.address, holder1, num1, { from: accounts[2] })
      );

      let balance = await tokenA.balanceOf.call(holder1);
      expect(balance).to.be.bignumber.equal(0);

      await tokenA.issue(num1, { from: holder1 });
      await expectThrow(
        () => contract.transfer(tokenA.address, holder1, num1, { from: accounts[2] })
      );

      balance = await tokenA.balanceOf.call(holder1);
      expect(balance).to.be.bignumber.equal(num1);

      await tokenA.approve(contract.address, num1, { from: holder1 });
      await contract.transfer(tokenA.address, holder1, num1, { from: accounts[2] });

      let balance2;
      [balance, balance2] = await Promise.all([
        tokenA.balanceOf.call(holder1),
        tokenA.balanceOf.call(accounts[2])
      ]);
      expect(balance).to.be.bignumber.equal(0);
      expect(balance2).to.be.bignumber.equal(num1);
    });

    it('sends tokens on sufficient balance/allowance when authorized', async () => {
      await contract.grantAccess(accounts[2]);
      await tokenA.issue(num1, { from: holder1 });
      await tokenA.approve(contract.address, num1, { from: holder1 });
      await contract.transfer(tokenA.address, holder1, num1, { from: accounts[2] });

      let balance2, balance;
      [balance, balance2] = await Promise.all([
        tokenA.balanceOf.call(holder1),
        tokenA.balanceOf.call(accounts[2])
      ]);
      expect(balance).to.be.bignumber.equal(0);
      expect(balance2).to.be.bignumber.equal(num1);
    });
  });

  describe('#transferTo', () => {
    const holder1 = accounts[4];
    const recipient = accounts[5];
    it('only allows transfer authorized address to call', async () => {
      await tokenA.issue(num1, { from: holder1 });
      await tokenA.approve(contract.address, num1, { from: holder1 });
      await contract.grantAccess(accounts[1]);

      // A random address should not be able to call
      await expectThrow(
        () => contract.transferTo(tokenA.address, holder1, recipient, num1, { from: accounts[3] })
      );
      // Nor should the owner
      await expectThrow(
        () => contract.transferTo(tokenA.address, holder1, recipient, num1,)
      );

      const [balance, balance2] = await Promise.all([
        tokenA.balanceOf.call(holder1),
        tokenA.balanceOf.call(recipient)
      ]);
      expect(balance).to.be.bignumber.equal(num1);
      expect(balance2).to.be.bignumber.equal(0);
    });

    it('fails on insufficient holder balance or allowance', async () => {
      await contract.grantAccess(accounts[2]);
      await expectThrow(
        () => contract.transferTo(tokenA.address, holder1, recipient, num1, { from: accounts[2] })
      );

      let balance = await tokenA.balanceOf.call(holder1);
      expect(balance).to.be.bignumber.equal(0);

      await tokenA.issue(num1, { from: holder1 });
      await expectThrow(
        () => contract.transferTo(tokenA.address, holder1, recipient, num1, { from: accounts[2] })
      );

      balance = await tokenA.balanceOf.call(holder1);
      expect(balance).to.be.bignumber.equal(num1);

      await tokenA.approve(contract.address, num1, { from: holder1 });
      await contract.transferTo(tokenA.address, holder1, recipient, num1, { from: accounts[2] });

      let balance2;
      [balance, balance2] = await Promise.all([
        tokenA.balanceOf.call(holder1),
        tokenA.balanceOf.call(recipient)
      ]);
      expect(balance).to.be.bignumber.equal(0);
      expect(balance2).to.be.bignumber.equal(num1);
    });

    it('sends tokens on sufficient balance/allowance when authorized', async () => {
      await contract.grantAccess(accounts[2]);
      await tokenA.issue(num1, { from: holder1 });
      await tokenA.approve(contract.address, num1, { from: holder1 });
      await contract.transferTo(tokenA.address, holder1, recipient, num1, { from: accounts[2] });

      let balance2, balance;
      [balance, balance2] = await Promise.all([
        tokenA.balanceOf.call(holder1),
        tokenA.balanceOf.call(recipient)
      ]);
      expect(balance).to.be.bignumber.equal(0);
      expect(balance2).to.be.bignumber.equal(num1);
    });
  });
});
