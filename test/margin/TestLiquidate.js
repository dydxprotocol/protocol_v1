/*global artifacts, contract, describe, it*/

const Margin= artifacts.require('Margin');
const TestLiquidateDelegator = artifacts.require('TestLiquidateDelegator');
const ERC20Short = artifacts.require('ERC20Short');
const ERC20 = artifacts.require('ERC20');
const { doShort, callLiquidate } = require('../helpers/MarginHelper');
const { ADDRESSES } = require('../helpers/Constants');
const expect = require('chai').expect;

describe('#liquidate', () => {
  const LIQUIDATE_PERCENT = .20; // 20%
  let dydxMargin, shortTx, erc20Short, lender, shortAmount;

  async function configureShort(initialHolder, accounts) {
    dydxMargin = await Margin.deployed();
    shortTx = await doShort(accounts);
    // Deploy an ERC20 short token
    erc20Short = await ERC20Short.new(shortTx.id, dydxMargin.address, initialHolder, [
      ADDRESSES.TEST[1],
      ADDRESSES.TEST[2]
    ]);
    // Transfer the short position from the short seller to the ERC20 short token
    await dydxMargin.transferShort(shortTx.id, erc20Short.address, { from: shortTx.seller });

    lender = shortTx.loanOffering.payer;

    const totalSupply = await erc20Short.totalSupply();
    // Transfer 20% of the short position to the lender
    shortAmount = totalSupply.toNumber() * LIQUIDATE_PERCENT;
    await erc20Short.transfer(shortTx.loanOffering.payer, shortAmount, { from: initialHolder });
  }

  contract('Margin', function(accounts) {
    it('allows a lender to liquidate quote tokens', async () => {
      const initialHolder = accounts[9]; // Using same accounts as TestERC20Short.js
      await configureShort(initialHolder, accounts);

      const quoteToken = await ERC20.at(shortTx.quoteToken);
      const lenderQuoteBefore = await quoteToken.balanceOf(lender);
      expect(lenderQuoteBefore.toNumber()).to.equal(0);

      const quoteBalance = await dydxMargin.getShortBalance(shortTx.id);

      // Liquidate quote tokens by burning short tokens
      await callLiquidate(dydxMargin, shortTx, shortAmount, lender);

      // It should burn the short tokens
      const lenderShortAfter = await erc20Short.balanceOf(lender);
      expect(lenderShortAfter.toNumber()).to.equal(0);

      // It should liquidate the correct amount of the quote balance
      const lenderQuoteAfter = await quoteToken.balanceOf(lender);
      expect(lenderQuoteAfter.toNumber()).to.equal(quoteBalance.toNumber() * LIQUIDATE_PERCENT);
    });
  });

  contract('Margin', function(accounts) {
    it('allows liquidating quote tokens if the lender is a smart contract', async () => {
      const initialHolder = accounts[9]; // Using same accounts as TestERC20Short.js
      await configureShort(initialHolder, accounts);

      // Create a new loan owner smart contract that implements liquidate delegator
      const liquidateDelegator = await TestLiquidateDelegator.new(dydxMargin.address, lender);
      // Transfer the loan to the liquidate delegator
      await dydxMargin.transferLoan(shortTx.id, liquidateDelegator.address, { from: lender });

      const quoteToken = await ERC20.at(shortTx.quoteToken);
      const lenderQuoteBefore = await quoteToken.balanceOf(lender);
      expect(lenderQuoteBefore.toNumber()).to.equal(0);

      const quoteBalance = await dydxMargin.getShortBalance(shortTx.id);

      // Liquidate quote tokens by burning short tokens
      await callLiquidate(dydxMargin, shortTx, shortAmount, lender);

      const lenderShortAfter = await erc20Short.balanceOf(lender);
      expect(lenderShortAfter.toNumber()).to.equal(0);

      const lenderQuoteAfter = await quoteToken.balanceOf(lender);
      expect(lenderQuoteAfter.toNumber()).to.equal(quoteBalance.toNumber() * LIQUIDATE_PERCENT);
    });
  });
});
