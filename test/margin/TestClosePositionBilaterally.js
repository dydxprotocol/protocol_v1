/*global artifacts, contract, describe, it*/

const Margin= artifacts.require('Margin');
const TestCloseLoanDelegator = artifacts.require('TestCloseLoanDelegator');
const ERC20Short = artifacts.require('ERC20Short');
const ERC20 = artifacts.require('ERC20');
const { doOpenPosition, callClosePositionAndLoan } = require('../helpers/MarginHelper');
const { ADDRESSES } = require('../helpers/Constants');
const { getPartialAmount } = require('../helpers/MathHelper');
const expect = require('chai').expect;

function multiplyByClosePercent(input) {
  const num = 1;
  const den = 5;
  return getPartialAmount(
    num,
    den,
    input
  );
}

describe('#closeLoanAndLoan', () => {
  let dydxMargin, OpenTx, erc20Contract, lender, principal;

  async function configurePosition(initialHolder, accounts) {
    dydxMargin = await Margin.deployed();
    OpenTx = await doOpenPosition(accounts);
    // Deploy an ERC20Short token
    erc20Contract = await ERC20Short.new(OpenTx.id, dydxMargin.address, initialHolder, [
      ADDRESSES.TEST[1],
      ADDRESSES.TEST[2]
    ]);
    // Transfer the position from the trader to the ERC20 token
    await dydxMargin.transferPosition(OpenTx.id, erc20Contract.address, { from: OpenTx.trader });

    lender = OpenTx.loanOffering.payer;

    const totalSupply = await erc20Contract.totalSupply();
    // Transfer 20% of the position to the lender
    principal = multiplyByClosePercent(totalSupply);
    await erc20Contract.transfer(OpenTx.loanOffering.payer, principal, { from: initialHolder });
  }

  contract('Margin', function(accounts) {
    it('allows a lender to get heldTokens', async () => {
      const initialHolder = accounts[9]; // Using same accounts as TestERC20Short.js
      await configurePosition(initialHolder, accounts);

      const heldToken = await ERC20.at(OpenTx.heldToken);
      const lenderHeldTokenBefore = await heldToken.balanceOf(lender);
      expect(lenderHeldTokenBefore.toNumber()).to.equal(0);

      const heldTokenBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);

      // Free heldTokens by burning tokens
      await callClosePositionAndLoan(dydxMargin, OpenTx, principal, lender);

      // It should burn the tokens
      const lenderAfter = await erc20Contract.balanceOf(lender);
      expect(lenderAfter.toNumber()).to.equal(0);

      // It should remove the correct amount of the heldToken balance
      const lenderHeldTokenAfter = await heldToken.balanceOf(lender);
      expect(lenderHeldTokenAfter).to.be.bignumber.equal(
        multiplyByClosePercent(heldTokenBalance));
    });
  });

  contract('Margin', function(accounts) {
    it('allows if the lender is a smart contract', async () => {
      const initialHolder = accounts[9]; // Using same accounts as TestERC20Short.js
      await configurePosition(initialHolder, accounts);

      // Create a new loan owner smart contract that implements closeLoanDelegator
      const closeLoanDelegator =
        await TestCloseLoanDelegator.new(dydxMargin.address, lender);
      // Transfer the loan to the closeLoanDelegator
      await dydxMargin.transferLoan(OpenTx.id, closeLoanDelegator.address, { from: lender });

      const heldToken = await ERC20.at(OpenTx.heldToken);
      const lenderHeldTokenBefore = await heldToken.balanceOf(lender);
      expect(lenderHeldTokenBefore.toNumber()).to.equal(0);

      const heldTokenBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);

      // Free heldTokens by burning tokens
      await callClosePositionAndLoan(dydxMargin, OpenTx, principal, lender);

      const lenderAfter = await erc20Contract.balanceOf(lender);
      expect(lenderAfter.toNumber()).to.equal(0);

      const lenderHeldTokenAfter = await heldToken.balanceOf(lender);
      expect(lenderHeldTokenAfter).to.be.bignumber.equal(
        multiplyByClosePercent(heldTokenBalance));
    });
  });
});
