ADDRESSES.TEST/*global artifacts, contract, describe, it, beforeEach*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const ShortSellRepo = artifacts.require("ShortSellRepo");

const { expectThrow } = require('../helpers/ExpectHelper');
const { ADDRESSES } = require('../helpers/Constants');
const { validateAccessControlledConstants } = require('../helpers/AccessControlledHelper');

const accessDelay =    new BigNumber('1234')
const gracePeriod =    new BigNumber('12345');
const id =             '1234567';
const badId =          '7654321';
const token1Address =  ADDRESSES.TEST[6];
const token2Address =  ADDRESSES.TEST[7];
const shortAmount =    new BigNumber('1000');
const interestRate =   new BigNumber('1');
const callTimestamp =  new BigNumber('444');
const callTimeLimit =  new BigNumber('222');
const startTimestamp = new BigNumber('4444');
const maxDuration =    new BigNumber('6666');
const lender1 =        ADDRESSES.TEST[0];
const seller1 =        ADDRESSES.TEST[1];
const lender2 =        ADDRESSES.TEST[2];
const seller2 =        ADDRESSES.TEST[3];

async function createAddShort(shortRepo, shortId, account) {
  await shortRepo.addShort(
    shortId,
    token1Address, // underlyingToken address
    token2Address, // baseToken address
    shortAmount,
    interestRate,
    callTimeLimit,
    startTimestamp,
    maxDuration,
    lender1,
    seller1,
    { from: account });
}

async function getShort(shortRepo, shortId) {
  const [
    underlyingToken,
    baseToken,
    shortAmount,
    closedAmount,
    interestRate,
    callTimeLimit,
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
    startTimestamp,
    callTimestamp,
    maxDuration,
    lender,
    seller
  };
}

async function expectShortIsClosed(shortRepo, id, expectClosed) {
  const closed = await shortRepo.closedShorts(id);
  expect(closed).to.equal(expectClosed);
}

contract('ShortSellRepo', function(accounts) {
  let contract;

  beforeEach('create new contracts', async () => {
    contract = await ShortSellRepo.new(accessDelay, gracePeriod);
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
      await expectThrow(() => createAddShort(contract, id, accounts[2]));
    });

    it('succeeds for an approved account', async () => {
      const containsBefore = await contract.containsShort.call(id);
      expect(containsBefore).to.be.false;

      await createAddShort(contract, id, accounts[1]);

      const containsAfter = await contract.containsShort.call(id);
      expect(containsAfter).to.be.true
      const s = await getShort(contract, id);
      expect(s.shortAmount.equals(shortAmount)).to.be.true;
      expect(s.closedAmount.equals(0)).to.be.true;
      expect(s.underlyingToken).to.equal(token1Address);
      expect(s.baseToken).to.equal(token2Address);
      expect(s.lender).to.equal(lender1);
      expect(s.seller).to.equal(seller1);
      expect(s.startTimestamp).to.be.bignumber.not.equal(0);
      expect(s.callTimestamp).to.be.bignumber.equal(0);
      expect(s.callTimeLimit).to.be.bignumber.equal(callTimeLimit);
      expect(s.lockoutTime).to.be.bignumber.equal(lockoutTime);
      expect(s.maxDuration).to.be.bignumber.equal(maxDuration);
    });

    it('fails when called twice for the same ID', async () => {
      await createAddShort(contract, id, accounts[1]);
      await expectThrow(() => createAddShort(contract, id, accounts[1]));
    });

    it('fails for startTimestamp of zero', async () => {
      await expectThrow(() => contract.addShort(
        id,
        token1Address,
        token2Address,
        shortAmount,
        interestRate,
        callTimeLimit,
        0, /* startTimestamp */
        maxDuration,
        lender1,
        seller1,
        { from: accounts[1] }));
    });
  });

  // For all the modification functions, we define a template of similar tests
  function createDescribe(functionName, valueToSet, checkingValue) {
    return () => {
      beforeEach('grant access to one account and create one short', async () => {
        await contract.grantAccess(accounts[1]);
        await createAddShort(contract, id, accounts[1]);
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
      await createAddShort(contract, id, accounts[1]);
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
    beforeEach('grant access to one account and create one short', async () => {
      await contract.grantAccess(accounts[1]);
      await createAddShort(contract, id, accounts[1]);
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
    beforeEach('grant access to one account and create one short', async () => {
      await contract.grantAccess(accounts[1]);
      await createAddShort(contract, id, accounts[1]);
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
