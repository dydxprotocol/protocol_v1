/*global artifacts, web3, contract, describe, it, beforeEach*/

const expect = require('chai').expect;
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const DelayedUpdateTester = artifacts.require("DelayedUpdateTester");
const { zeroAddr, addr1 } = require('../helpers/Constants');

contract('DelayedUpdateTester', function(accounts) {
  const [delay, expiration] = [new BigNumber('123456'), new BigNumber('123124123')];
  let contract;

  beforeEach(async () => {
    contract = await DelayedUpdateTester.new(delay, expiration);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const [contractDelay, contractExpiration] = await Promise.all([
        contract.updateDelay.call(),
        contract.updateExpiration.call()
      ]);

      expect(contractDelay.equals(delay)).to.be.true;
      expect(contractExpiration.equals(expiration)).to.be.true;
    });
  });

  describe('#delayedAddressUpdate', () => {
    it('does not immediately update the value', async () => {
      await contract.addr1Update('TEST', addr1);

      const addr1Value = await contract.addr1.call();

      expect(addr1Value).to.eq(zeroAddr);
    });

    it('does not update the calue if confirmed before timelock', async () => {
      await contract.addr1Update('TEST', addr1);
      await contract.addr1Update('TEST', addr1);

      const addr1Value = await contract.addr1.call();

      expect(addr1Value).to.eq(zeroAddr);
    });
  });
});
