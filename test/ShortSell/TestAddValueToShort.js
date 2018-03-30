/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');
const { wait } = require('@digix/tempo')(web3);

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const ProxyContract = artifacts.require("Proxy");
const TestInterestImpl = artifacts.require("TestInterestImpl");
const InterestImpl = artifacts.require("InterestImpl");

const {
  doShort,
  getShort,
  callAddValueToShort
} = require('../helpers/ShortSellHelper');
const {
  getShortLifetime
} = require('../helpers/CloseShortHelper');

describe('#addValueToShort', () => {
  contract('ShortSell', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const shortTx = await doShort(accounts);
      const [shortSell, baseToken] = await Promise.all([
        ShortSell.deployed(),
        BaseToken.deployed()
      ]);

      await baseToken.issueTo(shortTx.seller, shortTx.depositAmount);
      await baseToken.approve(
        ProxyContract.address,
        shortTx.depositAmount,
        { from: shortTx.seller }
      );

      await wait(1000);

      const tx = await callAddValueToShort(shortSell, shortTx);

      console.log(
        '\tShortSell.addValueToShort (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed
      );

      const short = await getShort(shortSell, shortTx.id);
      await TestInterestImpl.link('InterestImpl', InterestImpl.address);
      const interestCalc = await TestInterestImpl.new();
      const lifetime = await getShortLifetime(shortTx, tx);

      const effectiveAmount = await interestCalc.getInverseCompoundedInterest.call(
        shortTx.shortAmount,
        shortTx.loanOffering.rates.annualInterestRate,
        new BigNumber(lifetime),
        shortTx.loanOffering.rates.compoundingPeriod
      );

      expect(short.shortAmount).to.be.bignumber.eq(shortTx.shortAmount.plus(effectiveAmount));
    });
  });
});
