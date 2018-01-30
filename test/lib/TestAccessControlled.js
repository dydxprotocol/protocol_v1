/*global artifacts, web3, contract, describe, it, beforeEach*/

const expect = require('chai').expect;
const { wait } = require('@digix/tempo')(web3);
const BigNumber = require('bignumber.js');

const AccessControlledTester = artifacts.require("AccessControlledTester");
const { expectThrow } = require('../helpers/ExpectHelper');
const { validateAccessControlledConstants } = require('../helpers/AccessControlledHelper');

contract('AccessControlledTester', function(accounts) {
  const [delay, gracePeriod] = [new BigNumber('123456'), new BigNumber('1234567')];
  const num1 = new BigNumber(12);
  const [addr1, addr2] = [accounts[2], accounts[3]];
  let contract;

  beforeEach(async () => {
    contract = await AccessControlledTester.new(delay, gracePeriod);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      await validateAccessControlledConstants(contract, delay, gracePeriod);
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

    it('adds address to pending authorizations outside grace period', async() => {
      await wait(gracePeriod.toNumber());
      await contract.grantAccess(addr1);

      const [hasAccess, isPending] = await Promise.all([
        contract.authorized.call(addr1),
        contract.pendingAuthorizations.call(addr1)
      ]);

      expect(hasAccess).to.be.false;
      expect(isPending.gt(new BigNumber(0))).to.be.true;
    });

    it('only allows contract owner to grant access', async() => {
      await expectThrow(() => contract.grantAccess(addr1, { from: addr2 }));
    });
  });

  describe('#confirmAccess', () => {
    it('requires address to be in pending authorization', async() => {
      await expectThrow(() => contract.confirmAccess(addr1));

      const hasAccess = await contract.authorized.call(addr1);
      expect(hasAccess).to.be.false;
    });

    it('does not grant access before access delay', async() => {
      await wait(gracePeriod.toNumber());
      await contract.grantAccess(addr1);
      await expectThrow(() => contract.confirmAccess(addr1));

      const hasAccess = await contract.authorized.call(addr1);
      expect(hasAccess).to.be.false;
    });

    it('grants access to an address pending authorization after delay', async() => {
      await wait(gracePeriod.toNumber());
      await contract.grantAccess(addr1);
      await wait(delay.toNumber());
      await contract.confirmAccess(addr1);

      const [hasAccess, isPending] = await Promise.all([
        contract.authorized.call(addr1),
        contract.pendingAuthorizations.call(addr1)
      ]);

      expect(hasAccess).to.be.true;
      expect(isPending.equals(new BigNumber(0))).to.be.true;
    });

    it('only allows contract owner to confirm access', async() => {
      await wait(gracePeriod.toNumber());
      await contract.grantAccess(addr1);
      await wait(delay.toNumber());

      await expectThrow(() => contract.confirmAccess(addr1, { from: addr2 }));
    });
  });

  describe('#revokeAccess', () => {
    it('revokes access for an authorized address', async() => {
      await contract.grantAccess(addr1);
      await contract.revokeAccess(addr1);

      const hasAccess = await contract.authorized.call(addr1);
      expect(hasAccess).to.be.false;
    });

    it('removes an address from pending authorization', async() => {
      await wait(gracePeriod.toNumber());
      await contract.grantAccess(addr1);
      await contract.revokeAccess(addr1);

      const [hasAccess, isPending] = await Promise.all([
        contract.authorized.call(addr1),
        contract.pendingAuthorizations.call(addr1)
      ]);

      expect(hasAccess).to.be.false;
      expect(isPending.equals(new BigNumber(0))).to.be.true;
    });

    it('only allows contract owner to grant access', async() => {
      await contract.grantAccess(addr1);
      await expectThrow(() => contract.grantAccess(addr1, { from: addr2 }));
    });
  });

  describe('#requiresAccess', () => {
    it('does not allow access to function if caller is not authorized', async() => {
      await expectThrow(() => contract.setNum(num1));
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
