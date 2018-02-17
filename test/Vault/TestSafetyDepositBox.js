/*global artifacts, contract, describe, it, beforeEach*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const TestToken = artifacts.require("TestToken");
const SafetyDepositBox = artifacts.require("SafetyDepositBox");

const { transact } = require('../helpers/ContractHelper');
const { expectThrow, expectAssertFailure } = require('../helpers/ExpectHelper');
const { ADDRESSES } = require('../helpers/Constants');
const {
  validateStaticAccessControlledConstants
} = require('../helpers/AccessControlledHelper');

contract('SafetyDepositBox', function(accounts) {
  const gracePeriod = new BigNumber('1234567');
  let safetyDepositBox;

  const act1 = accounts[8];
  const act2 = accounts[9];
  let tokenA, tokenB;

  async function getAssignedTokens() {
    const [
      act1TokenA,
      act1TokenB,
      act2TokenA,
      act2TokenB
    ] = await Promise.all([
      safetyDepositBox.withdrawableBalances.call(act1, tokenA.address),
      safetyDepositBox.withdrawableBalances.call(act1, tokenB.address),
      safetyDepositBox.withdrawableBalances.call(act2, tokenA.address),
      safetyDepositBox.withdrawableBalances.call(act2, tokenB.address)
    ]);
    return {
      act1TokenA,
      act1TokenB,
      act2TokenA,
      act2TokenB
    }
  }

  async function withdrawAssignedTokens() {
    const [
      act1TokenA,
      act1TokenB,
      act2TokenA,
      act2TokenB
    ] = await Promise.all([
      transact(safetyDepositBox.withdraw, tokenA.address, { from: act1 }),
      transact(safetyDepositBox.withdraw, tokenB.address, { from: act1 }),
      transact(safetyDepositBox.withdraw, tokenA.address, { from: act2 }),
      transact(safetyDepositBox.withdraw, tokenB.address, { from: act2 })
    ]);
    return {
      act1TokenA,
      act1TokenB,
      act2TokenA,
      act2TokenB
    }
  }

  async function getOwnedTokens() {
    const [
      act1TokenA,
      act1TokenB,
      act2TokenA,
      act2TokenB
    ] = await Promise.all([
      tokenA.balanceOf.call(act1),
      tokenB.balanceOf.call(act1),
      tokenA.balanceOf.call(act2),
      tokenB.balanceOf.call(act2)
    ]);
    return {
      act1TokenA,
      act1TokenB,
      act2TokenA,
      act2TokenB
    }
  }

  beforeEach('migrate smart contracts and set permissions', async () => {
    safetyDepositBox = await SafetyDepositBox.new(gracePeriod);
    await safetyDepositBox.grantAccess(accounts[0]);
  });

  describe('Constructor', () => {

    it('sets constants correctly', async () => {
      await validateStaticAccessControlledConstants(safetyDepositBox, gracePeriod);

      const owner = await safetyDepositBox.owner.call();
      expect(owner.toLowerCase()).to.eq(accounts[0].toLowerCase());

      const arbitraryTokens = await safetyDepositBox.totalBalances.call(ADDRESSES.ZERO);
      expect(arbitraryTokens).to.be.bignumber.equal(0);
    });
  });

  describe('#withdraw', () => {
    const amountA = new BigNumber(10000);
    const amountB = new BigNumber(5000);

    beforeEach('create tokens and put into the safetyDepositBox', async () => {
      [tokenA, tokenB] = await Promise.all([
        TestToken.new(),
        TestToken.new()
      ]);
      expect(tokenA.address).to.not.equal(tokenB.address);
      await Promise.all([
        tokenA.issueTo(safetyDepositBox.address, amountA),
        tokenB.issueTo(safetyDepositBox.address, amountB)
      ]);

      const [tokenAInSafe, tokenBInSafe] = await Promise.all([
        tokenA.balanceOf.call(safetyDepositBox.address),
        tokenB.balanceOf.call(safetyDepositBox.address),
      ]);
      expect(tokenAInSafe).to.be.bignumber.equal(amountA);
      expect(tokenBInSafe).to.be.bignumber.equal(amountB);

      await Promise.all([
        safetyDepositBox.assignTokensToUser(tokenA.address, act1, amountA.div(2)),
        safetyDepositBox.assignTokensToUser(tokenB.address, act1, amountB.div(2)),
        safetyDepositBox.assignTokensToUser(tokenA.address, act2, amountA.div(4))
      ]);
      const assignedTokens = await getAssignedTokens();
      expect(assignedTokens.act1TokenA).to.be.bignumber.equal(amountA.div(2));
      expect(assignedTokens.act1TokenB).to.be.bignumber.equal(amountB.div(2));
      expect(assignedTokens.act2TokenA).to.be.bignumber.equal(amountA.div(4));
      expect(assignedTokens.act2TokenB).to.be.bignumber.equal(0);
    });

    it('succeeds but returns zero if there are no funds', async () => {
      const retValue = await transact(safetyDepositBox.withdraw, tokenB.address, { from: act2 });
      expect(retValue).to.be.bignumber.equal(0);

      const ownedTokens = await getOwnedTokens();
      expect(ownedTokens.act1TokenA).to.be.bignumber.equal(0);
      expect(ownedTokens.act1TokenB).to.be.bignumber.equal(0);
      expect(ownedTokens.act2TokenA).to.be.bignumber.equal(0);
      expect(ownedTokens.act2TokenB).to.be.bignumber.equal(0);
    });
    it('succeeds but if called twice in a row, but the second call has no effect', async () => {
      let withdrawnTokens = await withdrawAssignedTokens();
      withdrawnTokens = await withdrawAssignedTokens();
      expect(withdrawnTokens.act1TokenA).to.be.bignumber.equal(0);
      expect(withdrawnTokens.act1TokenB).to.be.bignumber.equal(0);
      expect(withdrawnTokens.act2TokenA).to.be.bignumber.equal(0);
      expect(withdrawnTokens.act2TokenB).to.be.bignumber.equal(0);

      let ownedTokens = await getOwnedTokens();
      expect(ownedTokens.act1TokenA).to.be.bignumber.equal(amountA.div(2));
      expect(ownedTokens.act1TokenB).to.be.bignumber.equal(amountB.div(2));
      expect(ownedTokens.act2TokenA).to.be.bignumber.equal(amountA.div(4));
      expect(ownedTokens.act2TokenB).to.be.bignumber.equal(0);

    });
    it('succeeds if there are non-zero funds', async () => {
      let withdrawnTokens = await withdrawAssignedTokens();
      expect(withdrawnTokens.act1TokenA).to.be.bignumber.equal(amountA.div(2));
      expect(withdrawnTokens.act1TokenB).to.be.bignumber.equal(amountB.div(2));
      expect(withdrawnTokens.act2TokenA).to.be.bignumber.equal(amountA.div(4));
      expect(withdrawnTokens.act2TokenB).to.be.bignumber.equal(0);

      const ownedTokens = await getOwnedTokens();
      expect(ownedTokens.act1TokenA).to.be.bignumber.equal(amountA.div(2));
      expect(ownedTokens.act1TokenB).to.be.bignumber.equal(amountB.div(2));
      expect(ownedTokens.act2TokenA).to.be.bignumber.equal(amountA.div(4));
      expect(ownedTokens.act2TokenB).to.be.bignumber.equal(0);
    });
  });

  describe('#assignTokensToUser', () => {
    const amountA = new BigNumber(10000);
    const amountB = new BigNumber(20000);
    const chunk = amountA.div(4);

    beforeEach('create tokens and put into the safetyDepositBox', async () => {
      [tokenA, tokenB] = await Promise.all([
        TestToken.new(),
        TestToken.new()
      ]);
      expect(tokenA.address).to.not.equal(tokenB.address);
      await Promise.all([
        tokenA.issueTo(safetyDepositBox.address, amountA),
        tokenB.issueTo(safetyDepositBox.address, amountB)
      ]);

      const [tokenAInSafe, tokenBInSafe] = await Promise.all([
        tokenA.balanceOf.call(safetyDepositBox.address),
        tokenB.balanceOf.call(safetyDepositBox.address),
      ]);
      expect(tokenAInSafe).to.be.bignumber.equal(amountA);
      expect(tokenBInSafe).to.be.bignumber.equal(amountB);

      const assignedTokens = await getAssignedTokens();
      expect(assignedTokens.act1TokenA).to.be.bignumber.equal(0);
      expect(assignedTokens.act1TokenB).to.be.bignumber.equal(0);
      expect(assignedTokens.act2TokenA).to.be.bignumber.equal(0);
      expect(assignedTokens.act2TokenB).to.be.bignumber.equal(0);
    });

    it('fails for non approved accounts', async () => {
      await expectThrow(() =>
        safetyDepositBox.assignTokensToUser(
          tokenA.address, act1, amountA.div(2),
          { from: accounts[1] }));
      const assignedTokens = await getAssignedTokens();
      expect(assignedTokens.act1TokenA).to.be.bignumber.equal(0);
    });
    it('fails if amount is zero', async () => {
      await expectThrow(() =>
        safetyDepositBox.assignTokensToUser(tokenA.address, act1, new BigNumber(0)));
      const assignedTokens = await getAssignedTokens();
      expect(assignedTokens.act1TokenA).to.be.bignumber.equal(0);
      expect(assignedTokens.act1TokenB).to.be.bignumber.equal(0);
    });
    it('fails if there are not enough tokens to assign to a single account', async () => {
      await expectAssertFailure(() =>
        safetyDepositBox.assignTokensToUser(tokenA.address, act1, amountA.plus(1)));
      await expectAssertFailure(() =>
        safetyDepositBox.assignTokensToUser(tokenB.address, act1, amountB.plus(1)));
      const assignedTokens = await getAssignedTokens();
      expect(assignedTokens.act1TokenA).to.be.bignumber.equal(0);
      expect(assignedTokens.act1TokenB).to.be.bignumber.equal(0);
    });
    it('fails if there are not enough to assign to multiple accounts', async () => {
      await safetyDepositBox.assignTokensToUser(tokenA.address, act1, amountA.minus(chunk));
      await expectAssertFailure(() =>
        safetyDepositBox.assignTokensToUser(tokenA.address, act2, chunk.plus(100)));
      const assignedTokens = await getAssignedTokens();
      expect(assignedTokens.act1TokenA).to.be.bignumber.equal(amountA.minus(chunk));
      expect(assignedTokens.act2TokenA).to.be.bignumber.equal(0);
    });
    it('succeeds if there are enough tokens', async () => {
      await safetyDepositBox.assignTokensToUser(tokenA.address, act1, amountA.minus(chunk));
      await safetyDepositBox.assignTokensToUser(tokenA.address, act2, chunk);
      await safetyDepositBox.assignTokensToUser(tokenB.address, act1, amountB);
      const assignedTokens = await getAssignedTokens();
      expect(assignedTokens.act1TokenA).to.be.bignumber.equal(amountA.minus(chunk));
      expect(assignedTokens.act2TokenA).to.be.bignumber.equal(chunk);
      expect(assignedTokens.act1TokenB).to.be.bignumber.equal(amountB);
    });
    it('succeeds if there are extra tokens', async () => {
      await safetyDepositBox.assignTokensToUser(tokenA.address, act1, amountA.div(2));
      await safetyDepositBox.assignTokensToUser(tokenA.address, act2, chunk);
      const assignedTokens = await getAssignedTokens();
      expect(assignedTokens.act1TokenA).to.be.bignumber.equal(amountA.div(2));
      expect(assignedTokens.act2TokenA).to.be.bignumber.equal(chunk);
    });
  });
});
