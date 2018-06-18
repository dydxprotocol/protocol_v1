const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const ProxyContract = artifacts.require("Proxy");
const Vault = artifacts.require("Vault");
const TestToken = artifacts.require("TestToken");

const { expectThrow, expectAssertFailure } = require('../helpers/ExpectHelper');
const {
  validateStaticAccessControlledConstants
} = require('../helpers/AccessControlledHelper');
const { issueAndSetAllowance } = require('../helpers/TokenHelper');
const { transact } = require('../helpers/ContractHelper');
const { expectLog } = require('../helpers/EventHelper');
const { ADDRESSES, BYTES32 } = require('../helpers/Constants');

contract('Vault', accounts => {
  const gracePeriod = new BigNumber('1234567');
  const num1 = new BigNumber(12);
  const num2 = new BigNumber(7);
  const num3 = new BigNumber(5);
  const id1 = BYTES32.TEST[0];
  const id2 = BYTES32.TEST[1];
  const id3 = BYTES32.TEST[2];
  const holder1 = accounts[4];
  const receiver = accounts[5];
  let proxy, vault, tokenA, tokenB;


  beforeEach('reset contracts', async () => {
    proxy = await ProxyContract.new(gracePeriod);
    [vault, tokenA, tokenB] = await Promise.all([
      Vault.new(proxy.address, gracePeriod),
      TestToken.new(),
      TestToken.new()
    ]);
    await proxy.grantAccess(vault.address);
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
    let balances = {
      vault: {
        id1: 0,
        id2: 0,
        total: 0,
        actual: 0
      }
    };

    async function checkBalances() {
      [
        balances.vault.id1,
        balances.vault.id2,
        balances.vault.total,
        balances.vault.actual
      ] = await Promise.all([
        vault.balances.call(id1, tokenA.address),
        vault.balances.call(id2, tokenA.address),
        vault.totalBalances.call(tokenA.address),
        tokenA.balanceOf.call(vault.address)
      ]);
    }

    it('successfully transfers tokens into vault', async () => {
      await Promise.all([
        issueAndSetAllowance(
          tokenA,
          holder1,
          num1,
          proxy.address
        ),
        vault.grantAccess(accounts[1])
      ]);

      await vault.transferToVault(id1, tokenA.address, holder1, num1, { from: accounts[1] });

      await checkBalances();
      expect(balances.vault.id1).to.be.bignumber.equal(num1);
      expect(balances.vault.total).to.be.bignumber.equal(num1);
      expect(balances.vault.actual).to.be.bignumber.equal(num1);
    });

    it('successfully transfers into different vaults', async () => {
      await Promise.all([
        issueAndSetAllowance(
          tokenA,
          holder1,
          num1.times(3),
          proxy.address
        ),
        vault.grantAccess(accounts[1])
      ]);

      await Promise.all([
        vault.transferToVault(id1, tokenA.address, holder1, num1, { from: accounts[1] }),
        vault.transferToVault(
          id2,
          tokenA.address,
          holder1,
          num1.times(2),
          { from: accounts[1] }
        )
      ]);

      await checkBalances();
      expect(balances.vault.id1).to.be.bignumber.equal(num1);
      expect(balances.vault.id2).to.be.bignumber.equal(num1.times(2));
      expect(balances.vault.total).to.be.bignumber.equal(num1.times(3));
      expect(balances.vault.actual).to.be.bignumber.equal(num1.times(3));
    });

    it('successfully accounts for different tokens', async () => {
      await Promise.all([
        issueAndSetAllowance(
          tokenA,
          holder1,
          num1,
          proxy.address
        ),
        issueAndSetAllowance(
          tokenB,
          holder1,
          num1.times(2),
          proxy.address
        ),
        vault.grantAccess(accounts[1])
      ]);

      await Promise.all([
        vault.transferToVault(id1, tokenA.address, holder1, num1, { from: accounts[1] }),
        vault.transferToVault(
          id1,
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
        vault.balances.call(id1, tokenA.address),
        vault.balances.call(id1, tokenB.address),
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
      await Promise.all([
        issueAndSetAllowance(
          tokenA,
          holder1,
          num1.times(3),
          proxy.address
        ),
        vault.grantAccess(accounts[1])
      ]);

      await expectThrow(
        vault.transferToVault(id1, tokenA.address, holder1, num1, { from: accounts[2] })
      );

      await checkBalances();
      expect(balances.vault.id1).to.be.bignumber.equal(0);
      expect(balances.vault.total).to.be.bignumber.equal(0);
      expect(balances.vault.actual).to.be.bignumber.equal(0);
    });

    it('throws on insufficient balance or proxy allowance', async () => {
      await vault.grantAccess(accounts[1]);

      await expectThrow(
        vault.transferToVault(id1, tokenA.address, holder1, num1, { from: accounts[1] })
      );
      await tokenA.issue(num1.times(3), { from: holder1 });
      await expectThrow(
        vault.transferToVault(id1, tokenA.address, holder1, num1, { from: accounts[1] })
      );

      const [balance, totalBalance, tokenBalance] = await Promise.all([
        vault.balances.call(id1, tokenA.address),
        vault.totalBalances.call(tokenA.address),
        tokenA.balanceOf.call(vault.address)
      ]);

      expect(balance).to.be.bignumber.equal(0);
      expect(totalBalance).to.be.bignumber.equal(0);
      expect(tokenBalance).to.be.bignumber.equal(0);
    });
  });

  describe('#withdrawExcessToken', () => {
    let balances = {
      vault: {
        id1: 0,
        id2: 0,
        id3: 0,
        total: 0,
        actual: 0
      }
    };

    async function checkBalances(token) {
      [
        balances.vault.id1,
        balances.vault.id2,
        balances.vault.id3,
        balances.vault.total,
        balances.vault.actual
      ] = await Promise.all([
        vault.balances.call(id1, token.address),
        vault.balances.call(id2, token.address),
        vault.balances.call(id3, token.address),
        vault.totalBalances.call(token.address),
        token.balanceOf.call(vault.address)
      ]);
    }

    async function doWithdraw(vault, token, to, expected, from) {
      if (!from) {
        from = await vault.owner.call();
      }

      // if expected amount is greater than zero, then call withdraw and check the result
      if (expected) {
        const nToken = await transact(vault.withdrawExcessToken, token.address, to, { from });
        expectLog(nToken.logs[0], 'ExcessTokensWithdrawn', {
          token: token.address,
          to: to,
          caller: from
        });
        expect(nToken.result).to.be.bignumber.equal(expected);
      }

      await expectThrow(
        vault.withdrawExcessToken(token.address, to, { from })
      );
    }

    it('fails for non-owner', async () => {
      await tokenB.issueTo(vault.address, num1);
      await checkBalances(tokenB);
      expect(balances.vault.actual).to.be.bignumber.equal(num1);

      // fail withdrawal for non-owner
      await doWithdraw(vault, tokenB, ADDRESSES.TEST[0], 0, accounts[1]);
    });

    it('successfully transfers all tokens with no holdings', async () => {
      await tokenB.issueTo(vault.address, num1);
      await checkBalances(tokenB);
      expect(balances.vault.id1).to.be.bignumber.equal(0);
      expect(balances.vault.id2).to.be.bignumber.equal(0);
      expect(balances.vault.total).to.be.bignumber.equal(0);
      expect(balances.vault.actual).to.be.bignumber.equal(num1);

      await doWithdraw(vault, tokenB, ADDRESSES.TEST[0], num1);

      await checkBalances(tokenB);
      expect(balances.vault.id1).to.be.bignumber.equal(0);
      expect(balances.vault.id2).to.be.bignumber.equal(0);
      expect(balances.vault.total).to.be.bignumber.equal(0);
      expect(balances.vault.actual).to.be.bignumber.equal(0);

      const withdrawnToken = await tokenB.balanceOf.call(ADDRESSES.TEST[0]);
      expect(withdrawnToken).to.be.bignumber.equal(num1);
    });

    it('successfully transfers tokens with holdings', async () => {
      await Promise.all([
        issueAndSetAllowance(
          tokenA,
          holder1,
          num1.plus(num2),
          proxy.address
        ),
        vault.grantAccess(accounts[1])
      ]);

      await Promise.all([
        vault.transferToVault(id1, tokenA.address, holder1, num1, { from: accounts[1] }),
        vault.transferToVault(id2, tokenA.address, holder1, num2, { from: accounts[1] }),
        tokenA.issueTo(vault.address, num3)
      ])

      await checkBalances(tokenA);
      expect(balances.vault.id1).to.be.bignumber.equal(num1);
      expect(balances.vault.id2).to.be.bignumber.equal(num2);
      expect(balances.vault.total).to.be.bignumber.equal(num1.plus(num2));
      expect(balances.vault.actual).to.be.bignumber.equal(num1.plus(num2).plus(num3));

      await doWithdraw(vault, tokenA, ADDRESSES.TEST[0], num3);

      await checkBalances(tokenA);
      expect(balances.vault.id1).to.be.bignumber.equal(num1);
      expect(balances.vault.id2).to.be.bignumber.equal(num2);
      expect(balances.vault.total).to.be.bignumber.equal(num1.plus(num2));
      expect(balances.vault.actual).to.be.bignumber.equal(num1.plus(num2));

      const withdrawnToken = await tokenA.balanceOf.call(ADDRESSES.TEST[0]);
      expect(withdrawnToken).to.be.bignumber.equal(num3);

      await doWithdraw(vault, tokenA, ADDRESSES.TEST[0], 0);

      await checkBalances(tokenA);
      expect(balances.vault.id1).to.be.bignumber.equal(num1);
      expect(balances.vault.id2).to.be.bignumber.equal(num2);
      expect(balances.vault.total).to.be.bignumber.equal(num1.plus(num2));
      expect(balances.vault.actual).to.be.bignumber.equal(num1.plus(num2));

      const withdrawnToken2 = await tokenA.balanceOf.call(ADDRESSES.TEST[0]);
      expect(withdrawnToken2).to.be.bignumber.equal(num3);
    });

    it('successfully transfers multiple tokens with holdings', async () => {
      await Promise.all([
        issueAndSetAllowance(
          tokenA,
          holder1,
          num1.plus(num2),
          proxy.address
        ),
        issueAndSetAllowance(
          tokenB,
          holder1,
          num1,
          proxy.address
        ),
        vault.grantAccess(accounts[1])
      ]);

      await Promise.all([
        vault.transferToVault(id1, tokenA.address, holder1, num1, { from: accounts[1] }),
        vault.transferToVault(id2, tokenA.address, holder1, num2, { from: accounts[1] }),
        vault.transferToVault(id3, tokenB.address, holder1, num1, { from: accounts[1] }),
        tokenA.issueTo(vault.address, num3),
        tokenB.issueTo(vault.address, num2)
      ])

      await checkBalances(tokenA);
      expect(balances.vault.id1).to.be.bignumber.equal(num1);
      expect(balances.vault.id2).to.be.bignumber.equal(num2);
      expect(balances.vault.id3).to.be.bignumber.equal(0);
      expect(balances.vault.total).to.be.bignumber.equal(num1.plus(num2));
      expect(balances.vault.actual).to.be.bignumber.equal(num1.plus(num2).plus(num3));

      await checkBalances(tokenB);
      expect(balances.vault.id1).to.be.bignumber.equal(0);
      expect(balances.vault.id2).to.be.bignumber.equal(0);
      expect(balances.vault.id3).to.be.bignumber.equal(num1);
      expect(balances.vault.total).to.be.bignumber.equal(num1);
      expect(balances.vault.actual).to.be.bignumber.equal(num1.plus(num2));

      await doWithdraw(vault, tokenA, ADDRESSES.TEST[0], num3);
      await doWithdraw(vault, tokenB, ADDRESSES.TEST[1], num2);

      await checkBalances(tokenA);
      expect(balances.vault.id1).to.be.bignumber.equal(num1);
      expect(balances.vault.id2).to.be.bignumber.equal(num2);
      expect(balances.vault.total).to.be.bignumber.equal(num1.plus(num2));
      expect(balances.vault.actual).to.be.bignumber.equal(num1.plus(num2));

      await checkBalances(tokenB);
      expect(balances.vault.id1).to.be.bignumber.equal(0);
      expect(balances.vault.id2).to.be.bignumber.equal(0);
      expect(balances.vault.id3).to.be.bignumber.equal(num1);
      expect(balances.vault.total).to.be.bignumber.equal(num1);
      expect(balances.vault.actual).to.be.bignumber.equal(num1);

      const withdrawnTokenA = await tokenA.balanceOf.call(ADDRESSES.TEST[0]);
      expect(withdrawnTokenA).to.be.bignumber.equal(num3);

      const withdrawnTokenB = await tokenB.balanceOf.call(ADDRESSES.TEST[1]);
      expect(withdrawnTokenB).to.be.bignumber.equal(num2);
    });
  });

  describe('#transferFromVault', () => {
    const halfNum1 = num1.div(2);
    let balances = {
      vault: {
        id1: 0,
        total: 0,
        actual: 0
      },
      receiver: 0
    };

    async function checkBalances() {
      [
        balances.vault.id1,
        balances.vault.total,
        balances.vault.actual,
        balances.receiver
      ] = await Promise.all([
        vault.balances.call(id1, tokenA.address),
        vault.totalBalances.call(tokenA.address),
        tokenA.balanceOf.call(vault.address),
        tokenA.balanceOf.call(receiver)
      ]);
    }

    beforeEach('place funds in vault', async () => {
      await Promise.all([
        // holder1 has tokens and allows the proxy to access them
        issueAndSetAllowance(
          tokenA,
          holder1,
          num1,
          proxy.address
        ),
        // account[1] acts as dYdX contract and puts the funds in the vault
        vault.grantAccess(accounts[1])
      ]);

      await vault.transferToVault(id1, tokenA.address, holder1, num1, { from: accounts[1] });

      await checkBalances();
      expect(balances.vault.id1).to.be.bignumber.equal(num1);
      expect(balances.vault.total).to.be.bignumber.equal(balances.vault.actual);
      expect(balances.vault.total).to.be.bignumber.equal(num1);
      expect(balances.receiver).to.be.bignumber.equal(0);
    });

    it('Sends tokens if vault has balance', async () => {
      await vault.grantAccess(receiver);
      await vault.transferFromVault(id1, tokenA.address, receiver, halfNum1, { from: receiver });

      await checkBalances();
      expect(balances.vault.id1).to.be.bignumber.equal(halfNum1);
      expect(balances.vault.total).to.be.bignumber.equal(balances.vault.actual);
      expect(balances.vault.total).to.be.bignumber.equal(halfNum1);
      expect(balances.receiver).to.be.bignumber.equal(halfNum1);

      await vault.transferFromVault(id1, tokenA.address, receiver, num1.div(2), { from: receiver });

      await checkBalances();
      expect(balances.vault.id1).to.be.bignumber.equal(0);
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
      await vault.transferFromVault(id1, tokenA.address, receiver, halfNum1, { from: receiver });

      // not okay to overwithdraw, even though those tokens are technically credited to the vault
      await expectAssertFailure(
        vault.transferFromVault(id1, tokenA.address, receiver, num1, { from: receiver })
      );

      // not okay to withdraw from a bad id
      await expectAssertFailure(
        vault.transferFromVault(id2, tokenA.address, receiver, num1, { from: receiver })
      );

      await checkBalances();
      expect(balances.vault.id1).to.be.bignumber.equal(halfNum1);
      expect(balances.vault.total).to.be.bignumber.equal(halfNum1);
      expect(balances.receiver).to.be.bignumber.equal(halfNum1);
      // prove that the vault actually has extra un-assigned funds
      expect(balances.vault.actual).to.be.bignumber.equal(num1.plus(halfNum1));
    });

    it('Does not allow unauthorized addresses to send', async () => {
      // holder1 is not an approved address and therefore cannot simply take their funds back
      await expectThrow(
        vault.transferFromVault(id1, tokenA.address, holder1, num1, { from: holder1 })
      );

      await checkBalances();
      expect(balances.vault.id1).to.be.bignumber.equal(num1);
      expect(balances.vault.total).to.be.bignumber.equal(balances.vault.actual);
      expect(balances.vault.total).to.be.bignumber.equal(num1);
      expect(balances.receiver).to.be.bignumber.equal(0);
    });
  });
});
