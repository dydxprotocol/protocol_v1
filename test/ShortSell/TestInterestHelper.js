/*global artifacts, contract, describe, before, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const BigNumber = require('bignumber.js');

const InterestHelper = artifacts.require("InterestHelper");
const { getGasCost } = require('../helpers/NodeHelper');

contract('InterestHelper', function(accounts) {
  let contract;

  describe('#getCompoundedInterest', () => {
    before('', async () => {
      contract = await InterestHelper.deployed();
    });

    it('', async () => {
      const total = new BigNumber('1e18');
      const percent = new BigNumber('1e18');
      const seconds = new BigNumber(60 * 60 * 24 * 600); // don't be a round number
      const result = await contract.getCompoundedInterest.call(total, percent, seconds, false);
      console.log(result.toString());
      const gasCost = await contract.getCompoundedInterest(total, percent, seconds, false);
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
