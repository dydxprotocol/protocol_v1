const expect = require('chai').expect;
const { wait } = require('@digix/tempo')(web3);
const BigNumber = require('bignumber.js');

const TestStaticAccessControlled = artifacts.require("TestStaticAccessControlled");
const { expectThrow } = require('../../helpers/ExpectHelper');
const { validateStaticAccessControlledConstants } = require('../../helpers/AccessControlledHelper');

contract('StaticAccessControlled', function(accounts) {
  const gracePeriod = new BigNumber('1234567');
  const num1 = new BigNumber(12);
  const [addr1, addr2] = [accounts[2], accounts[3]];
  let contract;

  beforeEach(async () => {
    contract = await TestStaticAccessControlled.new(gracePeriod);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      await validateStaticAccessControlledConstants(contract, gracePeriod);
    });
  });

  describe('#grantAccess', () => {
    it('allows access to be granted immediately during grace period', async() => {
      await contract.grantAccess(addr1);

      const hasAccess = await contract.authorized.call(addr1);
      expect(hasAccess).to.be.true;

      await contract.setNum(num1, { from: addr1 });
      const value = await contract.num.call();

      expect(value.equals(num1)).to.be.true;
    });

    it('does not allow authorization outside grace period', async() => {
      await wait(gracePeriod.toNumber());
      await expectThrow(contract.grantAccess(addr1));

      const hasAccess = await contract.authorized.call(addr1);

      expect(hasAccess).to.be.false;
    });

    it('only allows contract owner to grant access', async() => {
      await expectThrow(contract.grantAccess(addr1, { from: addr2 }));
    });
  });

  describe('#requiresAccess', () => {
    it('does not allow access to function if caller is not authorized', async() => {
      await expectThrow(contract.setNum(num1));
    });

    it('allows access if address is authorized', async() => {
      await contract.grantAccess(addr1);
      const hasAccess = await contract.authorized.call(addr1);
      expect(hasAccess).to.be.true;

      await contract.setNum(num1, { from: addr1 });
      const value = await contract.num.call();
      expect(value.equals(num1)).to.be.true;
    });
  });
});
