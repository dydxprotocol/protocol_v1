/*global artifacts, contract, describe, it*/

const Margin= artifacts.require('Margin');
const TestLiquidatePositionDelegator = artifacts.require('TestLiquidatePositionDelegator');
const ERC20MarginPosition = artifacts.require('ERC20MarginPosition');
const ERC20 = artifacts.require('ERC20');
const { doShort, callLiquidatePosition } = require('../helpers/MarginHelper');
const { ADDRESSES } = require('../helpers/Constants');
const expect = require('chai').expect;

describe('#liquidate', () => {
  const LIQUIDATE_PERCENT = .20; // 20%
  let dydxMargin, OpenTx, erc20Contract, lender, principal;

  async function configureShort(initialHolder, accounts) {
    dydxMargin = await Margin.deployed();
    OpenTx = await doShort(accounts);
    // Deploy an ERC20MarginPosition token
    erc20Contract = await ERC20MarginPosition.new(OpenTx.id, dydxMargin.address, initialHolder, [
      ADDRESSES.TEST[1],
      ADDRESSES.TEST[2]
    ]);
    // Transfer the short position from the short seller to the ERC20 token
    await dydxMargin.transferPosition(OpenTx.id, erc20Contract.address, { from: OpenTx.seller });

    lender = OpenTx.loanOffering.payer;

    const totalSupply = await erc20Contract.totalSupply();
    // Transfer 20% of the short position to the lender
    principal = totalSupply.toNumber() * LIQUIDATE_PERCENT;
    await erc20Contract.transfer(OpenTx.loanOffering.payer, principal, { from: initialHolder });
  }

  contract('Margin', function(accounts) {
    it('allows a lender to liquidate quote tokens', async () => {
      const initialHolder = accounts[9]; // Using same accounts as TestERC20MarginPosition.js
      await configureShort(initialHolder, accounts);

      const quoteToken = await ERC20.at(OpenTx.quoteToken);
      const lenderQuoteBefore = await quoteToken.balanceOf(lender);
      expect(lenderQuoteBefore.toNumber()).to.equal(0);

      const quoteBalance = await dydxMargin.getPositionBalance(OpenTx.id);

      // Liquidate quote tokens by burning short tokens
      await callLiquidatePosition(dydxMargin, OpenTx, principal, lender);

      // It should burn the short tokens
      const lenderShortAfter = await erc20Contract.balanceOf(lender);
      expect(lenderShortAfter.toNumber()).to.equal(0);

      // It should liquidate the correct amount of the quote balance
      const lenderQuoteAfter = await quoteToken.balanceOf(lender);
      expect(lenderQuoteAfter.toNumber()).to.equal(quoteBalance.toNumber() * LIQUIDATE_PERCENT);
    });
  });

  contract('Margin', function(accounts) {
    it('allows liquidating quote tokens if the lender is a smart contract', async () => {
      const initialHolder = accounts[9]; // Using same accounts as TestERC20MarginPosition.js
      await configureShort(initialHolder, accounts);

      // Create a new loan owner smart contract that implements liquidate delegator
      const liquidateDelegator =
        await TestLiquidatePositionDelegator.new(dydxMargin.address, lender);
      // Transfer the loan to the liquidate delegator
      await dydxMargin.transferLoan(OpenTx.id, liquidateDelegator.address, { from: lender });

      const quoteToken = await ERC20.at(OpenTx.quoteToken);
      const lenderQuoteBefore = await quoteToken.balanceOf(lender);
      expect(lenderQuoteBefore.toNumber()).to.equal(0);

      const quoteBalance = await dydxMargin.getPositionBalance(OpenTx.id);

      // Liquidate quote tokens by burning short tokens
      await callLiquidatePosition(dydxMargin, OpenTx, principal, lender);

      const lenderShortAfter = await erc20Contract.balanceOf(lender);
      expect(lenderShortAfter.toNumber()).to.equal(0);

      const lenderQuoteAfter = await quoteToken.balanceOf(lender);
      expect(lenderQuoteAfter.toNumber()).to.equal(quoteBalance.toNumber() * LIQUIDATE_PERCENT);
    });
  });
});
