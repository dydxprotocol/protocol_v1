/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const { expectThrow } = require('../helpers/ExpectHelper');

contract('LoanGetters', () => {
  describe('#getUnavailableLoanOfferingAmount', function(accounts) {
    it('', async () => {
    });
  });

  describe('#loanFills', function(accounts) {
    it('', async () => {
    });
  });

  describe('#loanCancels', function(accounts) {
    it('', async () => {
    });
  });

  describe('#loanNumbers', function(accounts) {
    it('', async () => {
    });
  });

  describe('#isLoanApproved', function(accounts) {
    it('', async () => {
    });
  });
});
