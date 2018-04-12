/*global artifacts, contract, describe, it*/

const Margin = artifacts.require('Margin');
const TestLiquidatePositionDelegator = artifacts.require('TestLiquidatePositionDelegator');
const ERC20MarginTrader = artifacts.require('ERC20MarginTrader');
const ERC20 = artifacts.require('ERC20');
const { doOpenPosition, callLiquidate } = require('../helpers/MarginHelper');
const { ADDRESSES } = require('../helpers/Constants');
const expect = require('chai').expect;

describe('#liquidatePosition', () => {
  const LIQUIDATE_PERCENT = .20; // 20%
  let margin, OpenPositionTx, erc20MarginTrader, lender, marginAmount;

  async function configurePosition(initialHolder, accounts) {
    margin = await Margin.deployed();
    OpenPositionTx = await doOpenPosition(accounts);
    // Deploy an ERC20MarginTrader token
    erc20MarginTrader = await ERC20MarginTrader.new(OpenPositionTx.id, margin.address, initialHolder, [
      ADDRESSES.TEST[1],
      ADDRESSES.TEST[2]
    ]);
    // Transfer the margin position from the margin trader to the ERC20MarginTrader token
    await margin.transferPosition(OpenPositionTx.id, erc20MarginTrader.address, { from: OpenPositionTx.trader });

    lender = OpenPositionTx.loanOffering.payer;

    const totalSupply = await erc20MarginTrader.totalSupply();
    // Transfer 20% of the margin position to the lender
    marginAmount = totalSupply.toNumber() * LIQUIDATE_PERCENT;
    await erc20MarginTrader.transfer(OpenPositionTx.loanOffering.payer, marginAmount, { from: initialHolder });
  }

  contract('Margin', function(accounts) {
    it('allows a lender to liquidate quote tokens', async () => {
      const initialHolder = accounts[9]; // Using same accounts as TestERC20MarginTrader.js
      await configurePosition(initialHolder, accounts);

      const quoteToken = await ERC20.at(OpenPositionTx.quoteToken);
      const lenderQuoteBefore = await quoteToken.balanceOf(lender);
      expect(lenderQuoteBefore.toNumber()).to.equal(0);

      const quoteBalance = await margin.getPositionBalance(OpenPositionTx.id);

      // Liquidate quote tokens by burning margin trader tokens
      await callLiquidate(margin, OpenPositionTx, marginAmount, lender);

      // It should burn the tokens
      const lenderMarginAfter = await erc20MarginTrader.balanceOf(lender);
      expect(lenderMarginAfter.toNumber()).to.equal(0);

      // It should liquidate the correct amount of the quote balance
      const lenderQuoteAfter = await quoteToken.balanceOf(lender);
      expect(lenderQuoteAfter.toNumber()).to.equal(quoteBalance.toNumber() * LIQUIDATE_PERCENT);
    });
  });

  contract('Margin', function(accounts) {
    it('allows liquidating quote tokens if the lender is a smart contract', async () => {
      const initialHolder = accounts[9]; // Using same accounts as TestERC20MarginTrader.js
      await configurePosition(initialHolder, accounts);

      // Create a new loan owner smart contract that implements liquidate delegator
      const liquidateDelegator = await TestLiquidatePositionDelegator.new(margin.address, lender);
      // Transfer the loan to the liquidate delegator
      await margin.transferLoan(OpenPositionTx.id, liquidateDelegator.address, { from: lender });

      const quoteToken = await ERC20.at(OpenPositionTx.quoteToken);
      const lenderQuoteBefore = await quoteToken.balanceOf(lender);
      expect(lenderQuoteBefore.toNumber()).to.equal(0);

      const quoteBalance = await margin.getPositionBalance(OpenPositionTx.id);

      // Liquidate quote tokens by burning margin trader tokens
      await callLiquidate(margin, OpenPositionTx, marginAmount, lender);

      const lenderMarginAfter = await erc20MarginTrader.balanceOf(lender);
      expect(lenderMarginAfter.toNumber()).to.equal(0);

      const lenderQuoteAfter = await quoteToken.balanceOf(lender);
      expect(lenderQuoteAfter.toNumber()).to.equal(quoteBalance.toNumber() * LIQUIDATE_PERCENT);
    });
  });
});
