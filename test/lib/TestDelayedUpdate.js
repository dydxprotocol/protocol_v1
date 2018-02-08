/*global artifacts, web3, contract, describe, it, beforeEach*/

const expect = require('chai').expect;
const { wait } = require('@digix/tempo')(web3);
const BigNumber = require('bignumber.js');

const DelayedUpdateTester = artifacts.require("DelayedUpdateTester");
const { ADDRESSES } = require('../helpers/Constants');
const { expectThrow } = require('../helpers/ExpectHelper');
const { validateDelayedUpdateConstants } = require('../helpers/DelayedUpdateHelper');

contract('DelayedUpdateTester', function() {
  const [delay, expiration] = [new BigNumber('123456'), new BigNumber('1234567')];
  const [num1, num2] = [new BigNumber(12), new BigNumber(145)];
  const [addr1, addr2] = [ADDRESSES.TEST[0], ADDRESSES.TEST[1]];
  let contract;

  beforeEach(async () => {
    contract = await DelayedUpdateTester.new(delay, expiration);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      await validateDelayedUpdateConstants(contract, delay, expiration);
    });
  });

  describe('#delayedAddressUpdate', () => {
    it('does not immediately update the value', async () => {
      await contract.addr1Update('TEST', addr1);

      const addr1Value = await contract.addr1.call();
      expect(addr1Value).to.eq(ADDRESSES.ZERO);
    });

    it('does not update the value if confirmed before timelock', async () => {
      await contract.addr1Update('TEST', addr1);
      await expectThrow(() => contract.addr1Update('TEST', addr1));

      const addr1Value = await contract.addr1.call();
      expect(addr1Value).to.eq(ADDRESSES.ZERO);
    });

    it('updates the value after the timelock and before the expiration', async () => {
      await contract.addr1Update('TEST', addr1);
      await wait(delay.toNumber());
      await contract.addr1Update('TEST', addr1);

      const addr1Value = await contract.addr1.call();
      expect(addr1Value.toLowerCase()).to.eq(addr1.toLowerCase());
    });

    it('does not update the value after the expiration', async () => {
      await contract.addr1Update('TEST', addr1);
      await wait(expiration.plus(delay).toNumber());
      await contract.addr1Update('TEST', addr1);

      const addr1Value = await contract.addr1.call();
      expect(addr1Value.toLowerCase()).to.eq(ADDRESSES.ZERO.toLowerCase());
    });

    it('adds a new pending update if the previous one is expired', async () => {
      await contract.addr1Update('TEST', addr1);
      await wait(expiration.plus(delay).toNumber());
      await contract.addr1Update('TEST', addr1);
      await wait(delay.toNumber());
      await contract.addr1Update('TEST', addr1);

      const addr1Value = await contract.addr1.call();
      expect(addr1Value.toLowerCase()).to.eq(addr1.toLowerCase());
    });

    it('keeps track of updates with different ids', async () => {
      await Promise.all([
        contract.addr1Update('TEST', addr1),
        contract.addr2Update('TEST2', addr2),
      ]);
      await wait(delay.toNumber());
      await Promise.all([
        contract.addr1Update('TEST', addr1),
        contract.addr2Update('TEST2', addr2),
      ]);

      const [addr1Value, addr2Value] = await Promise.all([
        contract.addr1.call(),
        contract.addr2.call(),
      ]);
      expect(addr1Value.toLowerCase()).to.eq(addr1.toLowerCase());
      expect(addr2Value.toLowerCase()).to.eq(addr2.toLowerCase());
    });
  });

  describe('#cancelAddressUpdate', () => {
    it('cancels a pending update', async () => {
      await contract.addr1Update('TEST', addr1);
      await contract.cancelAddrUpdate('TEST');
      await wait(delay.toNumber());
      await contract.addr1Update('TEST', addr1);

      const addr1Value = await contract.addr1.call();
      expect(addr1Value.toLowerCase()).to.eq(ADDRESSES.ZERO.toLowerCase());
    });
  });

  describe('#delayedUintUpdate', () => {
    it('does not immediately update the value', async () => {
      await contract.num1Update('TEST', num1);

      const value = await contract.num1.call();
      expect(value.equals(new BigNumber(0))).to.be.true;
    });

    it('does not update the value if confirmed before timelock', async () => {
      await contract.num1Update('TEST', num1);
      await expectThrow(() => contract.num1Update('TEST', num1));

      const value = await contract.num1.call();
      expect(value.equals(new BigNumber(0))).to.be.true;
    });

    it('updates the value after the timelock and before the expiration', async () => {
      await contract.num1Update('TEST', num1);
      await wait(delay.toNumber());
      await contract.num1Update('TEST', num1);

      const value = await contract.num1.call();
      expect(value.equals(num1)).to.be.true;
    });

    it('does not update the value after the expiration', async () => {
      await contract.num1Update('TEST', num1);
      await wait(expiration.plus(delay).toNumber());
      await contract.num1Update('TEST', num1);

      const value = await contract.num1.call();
      expect(value.equals(new BigNumber(0))).to.be.true;
    });

    it('adds a new pending update if the previous one is expired', async () => {
      await contract.num1Update('TEST', num1);
      await wait(expiration.plus(delay).toNumber());
      await contract.num1Update('TEST', num1);
      await wait(delay.toNumber());
      await contract.num1Update('TEST', num1);

      const value = await contract.num1.call();
      expect(value.equals(num1)).to.be.true;
    });

    it('keeps track of updates with different ids', async () => {
      await Promise.all([
        contract.num1Update('TEST', num1),
        contract.num2Update('TEST2', num2),
      ]);
      await wait(delay.toNumber());
      await Promise.all([
        contract.num1Update('TEST', num1),
        contract.num2Update('TEST2', num2),
      ]);

      const [value, value2] = await Promise.all([
        contract.num1.call(),
        contract.num2.call(),
      ]);
      expect(value.equals(num1)).to.be.true;
      expect(value2.equals(num2)).to.be.true;
    });
  });

  describe('#cancelUintUpdate', () => {
    it('cancels a pending update', async () => {
      await contract.num1Update('TEST', num1);
      await contract.cancelNumUpdate('TEST');
      await wait(delay.toNumber());
      await contract.num1Update('TEST', num1);

      const value = await contract.num1.call();
      expect(value.equals(new BigNumber(0))).to.be.true;
    });
  });
});
