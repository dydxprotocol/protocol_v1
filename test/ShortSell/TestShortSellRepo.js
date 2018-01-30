/*global artifacts, contract, describe, it, beforeEach*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const ShortSellRepo = artifacts.require("ShortSellRepo");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const { expectThrow } = require('../helpers/ExpectHelper');
const { validateAccessControlledConstants } = require('../helpers/AccessControlledHelper');


describe('#ShortSellRepo', () => {

  contract('ShortSellRepo', function(accounts) {

    // Constants used for testing
    const [accessDelay, gracePeriod] = [new BigNumber('1234'), new BigNumber('12345')];
    let contract, baseToken, underlyingToken;
    const id = 1234567;
    const shortAmount = 1000;
    const interestRate = 1;
    const callTimestamp = 444;
    const callTimeLimit = 222;
    const lockoutTime = 333;
    const startTimestamp = 4444;
    const maxDuration = 6666;
    const lender = accounts[4];
    const seller = accounts[5];

    // Helper functions to get specific functions from the smart contract
    function getAllCreationFunctions(shouldThrow, shortId, account) {
      let creationFunctions = [
        () => contract.addShort(
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
          {from: account}
        )
      ]
      return shouldThrow ? creationFunctions.map(x => expectThrow(x)) : creationFunctions;
    }

    function getAllModifyingFunctions(shouldThrow, shortId, account) {
      let modifyingFunctions = [
        () => contract.setShortCallStart(    shortId, callTimestamp,     {from: account}),
        () => contract.setShortLender(       shortId, lender,            {from: account}),
        () => contract.setShortSeller(       shortId, seller,            {from: account}),
        () => contract.setShortClosedAmount( shortId, shortAmount / 2,   {from: account}),
        () => contract.setShortAmount(       shortId, shortAmount * 2,   {from: account}),
        () => contract.setShortInterestRate( shortId, interestRate * 2,  {from: account}),
        () => contract.setShortCallTimeLimit(shortId, callTimeLimit * 2, {from: account}),
        () => contract.setShortLockoutTime(  shortId, lockoutTime * 2,   {from: account}),
        () => contract.setShortMaxDuration(  shortId, maxDuration * 2,   {from: account})
      ];
      return shouldThrow ? modifyingFunctions.map(x => expectThrow(x)) : modifyingFunctions;
    }

    function getAllDeletionFunctions(shouldThrow, shortId, account) {
      let deletionFunctions = [
        () => contract.deleteShort(      shortId, {from: account}),
        () => contract.markShortClosed(  shortId, {from: account}),
        () => contract.unmarkShortClosed(shortId, {from: account})
      ]
      return shouldThrow ? deletionFunctions.map(x => expectThrow(x)) : deletionFunctions;
    }

    // Test contstructor
    beforeEach(async () => {
      contract = await ShortSellRepo.new(accessDelay, gracePeriod);
      baseToken = await BaseToken.new();
      underlyingToken = await UnderlyingToken.new();
    });

    // All tests
    it('sets constants correctly', async () => {
      await validateAccessControlledConstants(contract, accessDelay, gracePeriod);
    });

    it('fails when first account (non-approved) is setting fields', async () => {
      await Promise.all(getAllCreationFunctions(true, id, accounts[1]));
      await Promise.all(getAllModifyingFunctions(true, id, accounts[1]));
    });

    it('succeeds only when first account (approved) is setting fields', async () => {
      await contract.grantAccess(accounts[1]);
      await Promise.all(getAllCreationFunctions(false, id, accounts[1]));
      await Promise.all(getAllModifyingFunctions(false, id, accounts[1]));
      await Promise.all(getAllModifyingFunctions(true, id, accounts[2]));
      await Promise.all(getAllDeletionFunctions(true, id, accounts[2]));
      await Promise.all(getAllDeletionFunctions(false, id, accounts[1]));
    });

    it('fails when id is invalid', async () => {
      const badId = 7654321;
      await contract.grantAccess(accounts[1]);
      await Promise.all(getAllCreationFunctions(false, id, accounts[1]));
      await Promise.all(getAllModifyingFunctions(true, badId, accounts[1]));
      // deletion functions do not check for a valid ID
      await Promise.all(getAllDeletionFunctions(false, badId, accounts[1]));
    });

  });
});
