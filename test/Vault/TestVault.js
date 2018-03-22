/*global artifacts, contract, describe, it, beforeEach*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const ProxyContract = artifacts.require("Proxy");
const Vault = artifacts.require("Vault");
const TestToken = artifacts.require("TestToken");

const { expectThrow, expectAssertFailure } = require('../helpers/ExpectHelper');
const {
  validateStaticAccessControlledConstants
} = require('../helpers/AccessControlledHelper');

contract('Vault', function(accounts) {
  const [delay, gracePeriod] = [new BigNumber('123456'), new BigNumber('1234567')];
  const num1 = new BigNumber(12);
  let proxy, vault, tokenA, tokenB;

  beforeEach('migrate smart contracts and set permissions', async () => {
    proxy = await ProxyContract.new(delay, gracePeriod);
    [vault, tokenA, tokenB] = await Promise.all([
      Vault.new(proxy.address, gracePeriod),
      TestToken.new(),
      TestToken.new()
    ]);
    await proxy.grantAccess(accounts[0]);
    await proxy.grantTransferAuthorization(vault.address, { from: accounts[0] });
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      await validateStaticAccessControlledConstants(vault, gracePeriod);
      const [
        owner,
        contractProxy
      ] = await Promise.all([
        vault.owner.call(),
        vault.PROXY.call()
      ]);

      expect(owner.toLowerCase()).to.eq(accounts[0].toLowerCase());
      expect(contractProxy.toLowerCase()).to.eq(proxy.address);
    });
  });

  describe('#transferToVault', () => {
    const holder1 = accounts[4];
    const id = 'TEST_ID';
    const id2 = 'TEST_ID_2';

    let balances = {
      vault: {
        id: 0,
        id2: 0,
        total: 0,
        actual: 0
      }
    };

    async function checkBalances() {
      [
        balances.vault.id,
        balances.vault.id2,
        balances.vault.total,
        balances.vault.actual
      ] = await Promise.all([
        vault.balances.call(id, tokenA.address),
        vault.balances.call(id2, tokenA.address),
        vault.totalBalances.call(tokenA.address),
        tokenA.balanceOf.call(vault.address)
      ]);
    }

    it('successfully transfers tokens into vault', async () => {
      await tokenA.issue(num1, { from: holder1 });
      await tokenA.approve(proxy.address, num1, { from: holder1 });
      await vault.grantAccess(accounts[1]);

      await vault.transferToVault(id, tokenA.address, holder1, num1, { from: accounts[1] });

      await checkBalances();
      expect(balances.vault.id).to.be.bignumber.equal(num1);
      expect(balances.vault.total).to.be.bignumber.equal(num1);
      expect(balances.vault.actual).to.be.bignumber.equal(num1);
    });

    it('successfully transfers into different vaults', async () => {
      await tokenA.issue(num1.times(3), { from: holder1 });
      await tokenA.approve(proxy.address, num1.times(3), { from: holder1 });
      await vault.grantAccess(accounts[1]);

      await Promise.all([
        vault.transferToVault(id, tokenA.address, holder1, num1, { from: accounts[1] }),
        vault.transferToVault(
          id2,
          tokenA.address,
          holder1,
          num1.times(2),
          { from: accounts[1] }
        )
      ]);

      await checkBalances();
      expect(balances.vault.id).to.be.bignumber.equal(num1);
      expect(balances.vault.id2).to.be.bignumber.equal(num1.times(2));
      expect(balances.vault.total).to.be.bignumber.equal(num1.times(3));
      expect(balances.vault.actual).to.be.bignumber.equal(num1.times(3));
    });

    it('successfully accounts for different tokens', async () => {
      await Promise.all([
        tokenA.issue(num1, { from: holder1 }),
        tokenB.issue(num1.times(2), { from: holder1 })
      ]);
      await Promise.all([
        tokenA.approve(proxy.address, num1, { from: holder1 }),
        tokenB.approve(proxy.address, num1.times(2), { from: holder1 }),
      ]);
      await vault.grantAccess(accounts[1]);

      await Promise.all([
        vault.transferToVault(id, tokenA.address, holder1, num1, { from: accounts[1] }),
        vault.transferToVault(
          id,
          tokenB.address,
          holder1,
          num1.times(2),
          { from: accounts[1] }
        ),
      ]);

      const [
        balanceA,
        balanceB,
        totalBalanceA,
        totalBalanceB,
        tokenBalanceA,
        tokenBalanceB
      ] = await Promise.all([
        vault.balances.call(id, tokenA.address),
        vault.balances.call(id, tokenB.address),
        vault.totalBalances.call(tokenA.address),
        vault.totalBalances.call(tokenB.address),
        tokenA.balanceOf.call(vault.address),
        tokenB.balanceOf.call(vault.address)
      ]);

      expect(balanceA).to.be.bignumber.equal(num1);
      expect(balanceB).to.be.bignumber.equal(num1.times(2));
      expect(totalBalanceA).to.be.bignumber.equal(num1);
      expect(totalBalanceB).to.be.bignumber.equal(num1.times(2));
      expect(tokenBalanceA).to.be.bignumber.equal(num1);
      expect(tokenBalanceB).to.be.bignumber.equal(num1.times(2));
    });

    it('does not allow unauthorized addresses to call', async () => {
      await tokenA.issue(num1.times(3), { from: holder1 });
      await tokenA.approve(proxy.address, num1.times(3), { from: holder1 });
      await vault.grantAccess(accounts[1]);
      await expectThrow(
        () => vault.transferToVault(id, tokenA.address, holder1, num1, { from: accounts[2] })
      );

      await checkBalances();
      expect(balances.vault.id).to.be.bignumber.equal(0);
      expect(balances.vault.total).to.be.bignumber.equal(0);
      expect(balances.vault.actual).to.be.bignumber.equal(0);
    });

    it('throws on insufficient balance or proxy allowance', async () => {
      await vault.grantAccess(accounts[1]);

      await expectThrow(
        () => vault.transferToVault(id, tokenA.address, holder1, num1, { from: accounts[1] })
      );
      await tokenA.issue(num1.times(3), { from: holder1 });
      await expectThrow(
        () => vault.transferToVault(id, tokenA.address, holder1, num1, { from: accounts[1] })
      );

      const [balance, totalBalance, tokenBalance] = await Promise.all([
        vault.balances.call(id, tokenA.address),
        vault.totalBalances.call(tokenA.address),
        tokenA.balanceOf.call(vault.address)
      ]);

      expect(balance).to.be.bignumber.equal(0);
      expect(totalBalance).to.be.bignumber.equal(0);
      expect(tokenBalance).to.be.bignumber.equal(0);
    });
  });

  describe('#transferFromVault', () => {
    const holder1 = accounts[4];
    const receiver = accounts[5];
    const id = 'TEST_ID';
    const id2 = 'TEST_ID_2';

    const halfNum1 = num1.div(2);
    let balances = {
      vault: {
        id: 0,
        total: 0,
        actual: 0
      },
      receiver: 0
    };

    async function checkBalances() {
      [
        balances.vault.id,
        balances.vault.total,
        balances.vault.actual,
        balances.receiver
      ] = await Promise.all([
        vault.balances.call(id, tokenA.address),
        vault.totalBalances.call(tokenA.address),
        tokenA.balanceOf.call(vault.address),
        tokenA.balanceOf.call(receiver)
      ]);
    }

    beforeEach('place funds in vault', async () => {
      // holder1 has tokens and allows the proxy to access them
      await tokenA.issue(num1, { from: holder1 });
      await tokenA.approve(proxy.address, num1, { from: holder1 });

      // account[1] acts as dYdX contract and puts the funds in the vault
      await vault.grantAccess(accounts[1]);
      await vault.transferToVault(id, tokenA.address, holder1, num1, { from: accounts[1] });

      await checkBalances();
      expect(balances.vault.id).to.be.bignumber.equal(num1);
      expect(balances.vault.total).to.be.bignumber.equal(balances.vault.actual);
      expect(balances.vault.total).to.be.bignumber.equal(num1);
      expect(balances.receiver).to.be.bignumber.equal(0);
    });

    it('Sends tokens if vault has balance', async () => {
      await vault.grantAccess(receiver);
      await vault.transferFromVault(id, tokenA.address, receiver, halfNum1, { from: receiver });

      await checkBalances();
      expect(balances.vault.id).to.be.bignumber.equal(halfNum1);
      expect(balances.vault.total).to.be.bignumber.equal(balances.vault.actual);
      expect(balances.vault.total).to.be.bignumber.equal(halfNum1);
      expect(balances.receiver).to.be.bignumber.equal(halfNum1);

      await vault.transferFromVault(id, tokenA.address, receiver, num1.div(2), { from: receiver });

      await checkBalances();
      expect(balances.vault.id).to.be.bignumber.equal(0);
      expect(balances.vault.total).to.be.bignumber.equal(balances.vault.actual);
      expect(balances.vault.total).to.be.bignumber.equal(0);
      expect(balances.receiver).to.be.bignumber.equal(num1);
    });

    it('Does not send tokens if vault does not have sufficient accounting', async () => {
      // issue extra tokens and secretly send to vault without using the normal proxy channel
      const extraAccount = accounts[9];
      await tokenA.issue(num1, { from: extraAccount }); //issue extra tokens
      tokenA.transfer(vault.address, num1, { from: extraAccount });

      // okay to withdraw half of the tokens
      await vault.grantAccess(receiver);
      await vault.transferFromVault(id, tokenA.address, receiver, halfNum1, { from: receiver });

      // not okay to overwithdraw, even though those tokens are technically credited to the vault
      await expectAssertFailure(
        () => vault.transferFromVault(id, tokenA.address, receiver, num1, { from: receiver })
      );

      // not okay to withdraw from a bad id
      await expectAssertFailure(
        () => vault.transferFromVault(id2, tokenA.address, receiver, num1, { from: receiver })
      );

      await checkBalances();
      expect(balances.vault.id).to.be.bignumber.equal(halfNum1);
      expect(balances.vault.total).to.be.bignumber.equal(halfNum1);
      expect(balances.receiver).to.be.bignumber.equal(halfNum1);
      // prove that the vault actually has extra un-assigned funds
      expect(balances.vault.actual).to.be.bignumber.equal(num1.plus(halfNum1));
    });

    it('Does not allow unauthorized addresses to send', async () => {
      // holder1 is not an approved address and therefore cannot simply take their funds back
      await expectThrow(
        () => vault.transferFromVault(id, tokenA.address, holder1, num1, { from: holder1 })
      );

      await checkBalances();
      expect(balances.vault.id).to.be.bignumber.equal(num1);
      expect(balances.vault.total).to.be.bignumber.equal(balances.vault.actual);
      expect(balances.vault.total).to.be.bignumber.equal(num1);
      expect(balances.receiver).to.be.bignumber.equal(0);
    });
  });
});
