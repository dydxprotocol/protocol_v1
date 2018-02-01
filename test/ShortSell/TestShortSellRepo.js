/*global artifacts, contract, describe, it, beforeEach*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const ShortSellRepo = artifacts.require("ShortSellRepo");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const { expectThrow } = require('../helpers/ExpectHelper');
const { validateAccessControlledConstants } = require('../helpers/AccessControlledHelper');

async function getShort(shortRepo, shortId) {
  const [
    underlyingToken,
    baseToken,
    shortAmount,
    closedAmount,
    interestRate,
    callTimeLimit,
    lockoutTime,
    startTimestamp,
    callTimestamp,
    maxDuration,
    lender,
    seller
  ] = await shortRepo.getShort.call(shortId);
  return {
    underlyingToken,
    baseToken,
    shortAmount,
    closedAmount,
    interestRate,
    callTimeLimit,
    lockoutTime,
    startTimestamp,
    callTimestamp,
    maxDuration,
    lender,
    seller
  };
}

async function expectShortIsClosed(shortRepo, id, expectClosed) {
  const closed = await shortRepo.shortIsClosed.call(id);
  expect(closed).to.equal(expectClosed);
}

contract('ShortSellRepo', function(accounts) {

  const accessDelay =    new BigNumber('1234')
  const gracePeriod =    new BigNumber('12345');
  const id =             '1234567';
  const badId =          '7654321';
  const shortAmount =    new BigNumber('1000');
  const interestRate =   new BigNumber('1');
  const callTimestamp =  new BigNumber('444');
  const callTimeLimit =  new BigNumber('222');
  const lockoutTime =    new BigNumber('333');
  const startTimestamp = new BigNumber('4444');
  const maxDuration =    new BigNumber('6666');
  const lender =         accounts[4];
  const seller =         accounts[5];
  const lender2 =        accounts[6];
  const seller2 =        accounts[7];
  let contract, baseToken, underlyingToken;

  async function createAddShort(shortId, account) {
    await contract.addShort(
      shortId,
      underlyingToken.address,
      baseToken.address,
      shortAmount,
      interestRate,
      callTimeLimit,
      lockoutTime,
      startTimestamp,
      maxDuration,
      lender,
      seller,
      { from: account });
  }

  beforeEach('create new contracts', async () => {
    [contract, baseToken, underlyingToken] = await Promise.all([
      ShortSellRepo.new(accessDelay, gracePeriod),
      BaseToken.new(),
      UnderlyingToken.new()
    ]);
  });

  describe('#Constructor', () => {
    it('sets constants correctly', async () => {
      await validateAccessControlledConstants(contract, accessDelay, gracePeriod);
    });
  });

  describe('#addShort', () => {
    beforeEach('grant access to one account' , async () => {
      await contract.grantAccess(accounts[1]);
    });
    it('fails for non-approved account', async () => {
      await expectThrow(() => createAddShort(id, accounts[2]));
    });
    it('succeeds for an approved account', async () => {
      const containsBefore = await contract.containsShort.call(id);
      expect(containsBefore).to.be.false;

      await createAddShort(id, accounts[1]);

      const containsAfter = await contract.containsShort.call(id);
      expect(containsAfter).to.be.true
      const s = await getShort(contract, id);
      expect(s.shortAmount.equals(shortAmount)).to.be.true;
      expect(s.closedAmount.equals(0)).to.be.true;
      expect(s.underlyingToken).to.equal(underlyingToken.address);
      expect(s.baseToken).to.equal(baseToken.address);
      expect(s.lender).to.equal(lender);
      expect(s.seller).to.equal(seller);
      expect(s.startTimestamp.equals(0)).to.be.false;
      expect(s.callTimestamp.equals(0)).to.be.true;
      expect(s.callTimeLimit.equals(callTimeLimit)).to.be.true;
      expect(s.lockoutTime.equals(lockoutTime)).to.be.true;
      expect(s.maxDuration.equals(maxDuration)).to.be.true;
    });
    it('fails when called twice for the same ID', async () => {
      await createAddShort(id, accounts[1]);
      await expectThrow(() => createAddShort(id, accounts[1]));
    });
    it('fails for startTimestamp of zero', async () => {
      await expectThrow(() => contract.addShort(
        id,
        underlyingToken.address,
        baseToken.address,
        shortAmount,
        interestRate,
        callTimeLimit,
        lockoutTime,
        0, /* startTimestamp */
        maxDuration,
        lender,
        seller,
        { from: accounts[1] }));
    });
  });

  // For all the modification functions, we define a template of similar tests
  function createDescribe(functionName, valueToSet, checkingValue) {
    return () => {
      beforeEach('grant access to one account and create one short', async () => {
        await contract.grantAccess(accounts[1]);
        await createAddShort(id, accounts[1]);
      });
      it('fails for non-approved account', async () => {
        await expectThrow(() => contract[functionName](id, valueToSet, { from: accounts[2] }));
      });
      it('fails for an invalid short id', async () => {
        await expectThrow(() => contract[functionName](badId, valueToSet, { from: accounts[1] }));
      });
      it('succeeds for an approved account', async () => {
        await contract[functionName](id, valueToSet, { from: accounts[1] });
        const short = await getShort(contract, id);
        console.log(typeof valueToSet);
        if (typeof valueToSet === 'object') { // assume to be BigNumber
          expect(short[checkingValue].equals(valueToSet)).to.be.true;
        } else { // assume to be string
          expect(short[checkingValue]).to.equal(valueToSet);
        }
      });
    }
  }

  describe('#setShortCallStart',
    createDescribe('setShortCallStart', callTimestamp, 'callTimestamp'));

  describe('#setShortLender',
    createDescribe('setShortLender', lender2, 'lender'));

  describe('#setShortSeller',
    createDescribe('setShortSeller', seller2, 'seller'));

  describe('#setShortClosedAmount',
    createDescribe('setShortClosedAmount', shortAmount.div(2), 'closedAmount'));

  describe('#setShortAmount',
    createDescribe('setShortAmount', shortAmount.mul(2), 'shortAmount'));

  describe('#setShortInterestRate',
    createDescribe('setShortInterestRate', interestRate.mul(2), 'interestRate'));

  describe('#setShortCallTimeLimit',
    createDescribe('setShortCallTimeLimit', callTimeLimit.mul(2), 'callTimeLimit'));

  describe('#setShortLockoutTime',
    createDescribe('setShortLockoutTime', lockoutTime.mul(2), 'lockoutTime'));

  describe('#setShortMaxDuration',
    createDescribe('setShortMaxDuration', maxDuration.mul(2), 'maxDuration'));

  // We do this one separately since it should succeed even if the id doesn't match a valid short
  describe('#deleteShort', () => {
    beforeEach(async () => {
      await contract.grantAccess(accounts[1]);
      await createAddShort(id, accounts[1]);
    });
    it('fails for a non-approved account', async () => {
      await expectThrow(() => contract.deleteShort(id, { from: accounts[2] }));
    });
    it('succeeds for a non-valid id', async () => {
      await contract.deleteShort(badId, { from: accounts[1] });
      const contains = await contract.containsShort.call(badId);
      expect(contains).to.be.false;
    });
    it('succeeds for an existing short', async () => {
      const containsBefore = await contract.containsShort.call(id);
      expect(containsBefore).to.be.true;
      await contract.deleteShort(id, { from: accounts[1] });
      const containsAfter = await contract.containsShort.call(id);
      expect(containsAfter).to.be.false;
    });
  });

  describe('#markShortClosed', () => {
    beforeEach(async () => {
      await contract.grantAccess(accounts[1]);
      await createAddShort(id, accounts[1]);
    });
    it('fails for a non-approved account', async () => {
      await expectShortIsClosed(contract, id, false);
      await expectThrow(() => contract.markShortClosed(id, { from: accounts[2] }));
      await expectShortIsClosed(contract, id, false);
    });
    it('succeeds for non-existing id', async () => {
      await expectShortIsClosed(contract, badId, false);
      await contract.markShortClosed(badId, { from: accounts[1] });
      await expectShortIsClosed(contract, badId, true);
    });
    it('succeeds for existing id', async () => {
      await expectShortIsClosed(contract, id, false);
      await contract.markShortClosed(id, { from: accounts[1] });
      await expectShortIsClosed(contract, id, true);
    });
    it('succeeds when called twice', async () => {
      await expectShortIsClosed(contract, id, false);
      await contract.markShortClosed(id, { from: accounts[1] });
      await contract.markShortClosed(id, { from: accounts[1] });
      await expectShortIsClosed(contract, id, true);
    });
  });

  describe('#unmarkShortClosed', () => {
    beforeEach(async () => {
      await contract.grantAccess(accounts[1]);
      await createAddShort(id, accounts[1]);
      await contract.markShortClosed(id, { from: accounts[1] });
    });
    it('fails for a non-approved account', async () => {
      await expectShortIsClosed(contract, id, true);
      await expectThrow(() => contract.unmarkShortClosed(id, { from: accounts[2] }));
      await expectShortIsClosed(contract, id, true);
    });
    it('succeeds for non-existing id', async () => {
      await expectShortIsClosed(contract, badId, false);
      await contract.unmarkShortClosed(badId, { from: accounts[1] });
      await expectShortIsClosed(contract, badId, false);
    });
    it('succeeds for existing id', async () => {
      await expectShortIsClosed(contract, id, true);
      await contract.unmarkShortClosed(id, { from: accounts[1] });
      await expectShortIsClosed(contract, id, false);
    });
    it('succeeds when called twice', async () => {
      await expectShortIsClosed(contract, id, true);
      await contract.unmarkShortClosed(id, { from: accounts[1] });
      await contract.unmarkShortClosed(id, { from: accounts[1] });
      await expectShortIsClosed(contract, id, false);
    });
  });
});
