/*global artifacts, contract, describe, before, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const InterestImpl = artifacts.require("InterestImpl");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const { getGasCost } = require('../helpers/NodeHelper');

contract('InterestHelper', function(accounts) {
  let contract;
  let ONE_DAY = 60*60*24;

  describe('#getCompoundedInterest', () => {
    before('', async () => {
      await TestInterestImpl.link('InterestImpl', InterestImpl.address);
      contract = await TestInterestImpl.new();
    });

    it('', async () => {
      const total = new BigNumber('1e18');
      const percent = new BigNumber('1e18');
      const seconds = new BigNumber(60 * 60 * 24 * 365); // don't be a round number
      const rounding = new BigNumber(0); // no rounding
      const result = await contract.getCompoundedInterest.call(total, percent, seconds, rounding);
      console.log(result.toString());
      const gasCost = await contract.getCompoundedInterest(total, percent, seconds, rounding);
      console.log(gasCost);


      /*
      let prevtx = new BigNumber(0);
      let diff = new BigNumber(0);
      for (let secs = 1000000; secs < 2000000; secs+= 1000) {
        const tx = await contract.getCompoundedInterest.call(total, percent, secs);
        expect(tx).to.be.bignumber.gt(prevtx);
        //const gasCost = await getGasCost(tx.transactionHash);

        if (secs > 1001000) {
          expect(tx.minus(prevtx)).to.be.bignumber.gt(diff);
        }
        diff = tx.minus(prevtx);
        console.log(tx, diff);
        prevtx = tx;
      }
      */
    });
  });
});
