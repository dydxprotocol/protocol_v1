const { TEST_POSITIONS, reset } = require('../../../src/index');
const { getPosition } = require('../../helpers/MarginHelper');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require('Margin');
const TokenA = artifacts.require('TokenA');

contract('Margin', accounts => {
  describe('TEST_POSITIONS', () => {
  //   it('sets up positions correctly', async () => {
  //     const margin = await Margin.deployed();
  //
  //     const promises = TEST_POSITIONS.map(async testPosition => {
  //       const position = await getPosition(margin, testPosition.id);
  //
  //       expect(testPosition.owedToken).to.be.eq(position.owedToken);
  //       expect(testPosition.heldToken).to.be.eq(position.heldToken);
  //       expect(testPosition.lender).to.be.eq(position.lender);
  //       expect(testPosition.owner).to.be.eq(position.owner);
  //       expect(testPosition.interestRate).to.be.bignumber.eq(position.interestRate);
  //       expect(testPosition.requiredDeposit).to.be.bignumber.eq(position.requiredDeposit);
  //       expect(testPosition.callTimeLimit).to.be.bignumber.eq(position.callTimeLimit);
  //       expect(testPosition.startTimestamp).to.be.bignumber.eq(position.startTimestamp);
  //       expect(testPosition.callTimestamp).to.be.bignumber.eq(position.callTimestamp);
  //       expect(testPosition.maxDuration).to.be.bignumber.eq(position.maxDuration);
  //       expect(testPosition.interestPeriod).to.be.bignumber.eq(position.interestPeriod);
  //     });
  //
  //     await Promise.all(promises);
  //   });
  // });
  //
  // describe('#reset', () => {
  //   it('resets any transactions made', async () => {
  //     const account = accounts[5];
  //     const amount = new BigNumber(123456);
  //     const token = await TokenA.deployed();
  //
  //     const startingBalance = await token.balanceOf.call(account);
  //     await token.issueTo(account, amount);
  //     const afterBalance = await token.balanceOf.call(account);
  //
  //     expect(afterBalance).to.be.bignumber.eq(startingBalance.plus(amount));
  //
  //     await reset(web3);
  //
  //     const balanceAfterReset = await token.balanceOf.call(account);
  //     expect(balanceAfterReset).to.be.bignumber.eq(startingBalance);
  //   });
  });
});
