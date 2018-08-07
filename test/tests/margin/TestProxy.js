const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const TokenProxy = artifacts.require("TokenProxy");
const TestToken = artifacts.require("TestToken");
const { BIGNUMBERS } = require('../../helpers/Constants');
const { expectThrow } = require('../../helpers/ExpectHelper');
const { validateStaticAccessControlledConstants } = require('../../helpers/AccessControlledHelper');
const { issueAndSetAllowance } = require('../../helpers/TokenHelper');

contract('TokenProxy', accounts => {
  const gracePeriod = new BigNumber('1234567');
  const num1 = new BigNumber(12);
  let contract, tokenA, tokenB;

  beforeEach(async () => {
    [contract, tokenA, tokenB] = await Promise.all([
      TokenProxy.new(gracePeriod),
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

  describe('#transferTokens', () => {
    const holder1 = accounts[4];
    const recipient = accounts[5];
    it('only allows transfer authorized address to call', async () => {
      await issueAndSetAllowance(
        tokenA,
        holder1,
        num1,
        contract.address
      );
      await contract.grantAccess(accounts[1]);

      // A random address should not be able to call
      await expectThrow(
        contract.transferTokens(tokenA.address, holder1, recipient, num1, { from: accounts[3] })
      );
      // Nor should the owner
      await expectThrow(
        contract.transferTokens(tokenA.address, holder1, recipient, num1,)
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
        contract.transferTokens(tokenA.address, holder1, recipient, num1, { from: accounts[2] })
      );

      let balance = await tokenA.balanceOf.call(holder1);
      expect(balance).to.be.bignumber.equal(0);

      await tokenA.issue(num1, { from: holder1 });
      await expectThrow(
        contract.transferTokens(tokenA.address, holder1, recipient, num1, { from: accounts[2] })
      );

      balance = await tokenA.balanceOf.call(holder1);
      expect(balance).to.be.bignumber.equal(num1);

      await tokenA.approve(contract.address, num1, { from: holder1 });
      await contract.transferTokens(
        tokenA.address, holder1, recipient, num1, { from: accounts[2] });

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
      await issueAndSetAllowance(
        tokenA,
        holder1,
        num1,
        contract.address
      );
      await contract.transferTokens(
        tokenA.address, holder1, recipient, num1, { from: accounts[2] });

      let balance2, balance;
      [balance, balance2] = await Promise.all([
        tokenA.balanceOf.call(holder1),
        tokenA.balanceOf.call(recipient)
      ]);
      expect(balance).to.be.bignumber.equal(0);
      expect(balance2).to.be.bignumber.equal(num1);
    });
  });

  describe('#available', () => {
    let account;
    const num1 = new BigNumber('1e18');
    const num2 = new BigNumber('5e18');

    async function expectAvailable(expected) {
      const available = await contract.available.call(account, tokenA.address);
      expect(available).to.be.bignumber.equal(expected);
    }

    afterEach('check available returns zero for non-relevant token', async () => {
      const availableB = await contract.available.call(account, tokenB.address);
      expect(availableB).to.be.bignumber.equal(BIGNUMBERS.ZERO);
    });

    it('correct for positive balance == allowance', async () => {
      account = accounts[5];
      await expectAvailable(BIGNUMBERS.ZERO);

      await issueAndSetAllowance(
        tokenA,
        account,
        num2,
        contract.address
      );

      await expectAvailable(num2);
    });

    it('correct for zero balance == allowance', async () => {
      account = accounts[6];
      await expectAvailable(BIGNUMBERS.ZERO);

      await issueAndSetAllowance(
        tokenA,
        account,
        BIGNUMBERS.ZERO,
        contract.address
      );

      await expectAvailable(BIGNUMBERS.ZERO);
    });

    it('correct for balance > allowance', async () => {
      account = accounts[7];
      await expectAvailable(BIGNUMBERS.ZERO);

      await tokenA.issue(num2, { from: account });

      await expectAvailable(BIGNUMBERS.ZERO);

      await tokenA.approve(contract.address, num1, { from: account });

      await expectAvailable(num1);
    });

    it('correct for balance < allowance', async () => {
      account = accounts[8];
      await expectAvailable(BIGNUMBERS.ZERO);

      await tokenA.approve(contract.address, num2, { from: account });

      await expectAvailable(BIGNUMBERS.ZERO);

      await tokenA.issue(num1, { from: account });

      await expectAvailable(num1);
    });
  });
});
