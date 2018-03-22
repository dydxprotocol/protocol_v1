const ShortSell = artifacts.require('ShortSell');
const TestWithdrawDelegator = artifacts.require('TestWithdrawDelegator');
const ERC20Short = artifacts.require('ERC20Short');
const ERC20 = artifacts.require('ERC20');
const { doShort } = require('../helpers/ShortSellHelper');
const { ADDRESSES } = require('../helpers/Constants');
const expect = require('chai').expect;

describe('#withdraw', () => {
  const WITHDRAW_PERCENT = .20; // 20%
  let shortSell, shortTx, erc20Short, lender, shortAmount;

  async function configureShort(initialHolder, accounts) {
    shortSell = await ShortSell.deployed();
    shortTx = await doShort(accounts);
    // Deploy an ERC20 short token
    erc20Short = await ERC20Short.new(shortTx.id, shortSell.address, initialHolder, [
      ADDRESSES.TEST[1],
      ADDRESSES.TEST[2]
    ]);
    // Transfer the short position from the short seller to the ERC20 short token
    await shortSell.transferShort(shortTx.id, erc20Short.address, { from: shortTx.seller });

    lender = shortTx.loanOffering.lender;

    const totalSupply = await erc20Short.totalSupply();
    // Transfer 20% of the short position to the lender
    shortAmount = totalSupply.toNumber() * WITHDRAW_PERCENT;
    await erc20Short.transfer(shortTx.loanOffering.lender, shortAmount, { from: initialHolder });
  }

  contract('ShortSell', function(accounts) {
    it('allows a lender to withdraw base tokens', async () => {
      const initialHolder = accounts[9]; // Using same accounts as TestERC20Short.js
      await configureShort(initialHolder, accounts);

      const baseToken = await ERC20.at(shortTx.baseToken);
      const lenderBaseBefore = await baseToken.balanceOf(lender);
      expect(lenderBaseBefore.toNumber()).to.equal(0);

      const baseBalance = await shortSell.getShortBalance(shortTx.id);

      // Withdraw base tokens by burning short tokens
      await shortSell.withdraw(shortTx.id, shortAmount, { from: lender });

      // It should burn the short tokens
      const lenderShortAfter = await erc20Short.balanceOf(lender);
      expect(lenderShortAfter.toNumber()).to.equal(0);

      // It should withdraw the correct amount of the base balance
      const lenderBaseAfter = await baseToken.balanceOf(lender);
      expect(lenderBaseAfter.toNumber()).to.equal(baseBalance.toNumber() * WITHDRAW_PERCENT);
    });
  });

  contract('ShortSell', function(accounts) {
    it('allows withdrawing base tokens if the lender is a smart contract', async () => {
      const initialHolder = accounts[9]; // Using same accounts as TestERC20Short.js
      await configureShort(initialHolder, accounts);

      // Create a new loan owner smart contract that implements withdraw delegator
      const withdrawDelegator = await TestWithdrawDelegator.new(shortSell.address, lender);
      // Transfer the loan to the withdraw delegator
      await shortSell.transferLoan(shortTx.id, withdrawDelegator.address, { from: lender });

      const baseToken = await ERC20.at(shortTx.baseToken);
      const lenderBaseBefore = await baseToken.balanceOf(lender);
      expect(lenderBaseBefore.toNumber()).to.equal(0);

      const baseBalance = await shortSell.getShortBalance(shortTx.id);

      // Withdraw base tokens by burning short tokens
      await shortSell.withdraw(shortTx.id, shortAmount, { from: lender });

      const lenderShortAfter = await erc20Short.balanceOf(lender);
      expect(lenderShortAfter.toNumber()).to.equal(0);

      const lenderBaseAfter = await baseToken.balanceOf(lender);
      expect(lenderBaseAfter.toNumber()).to.equal(baseBalance.toNumber() * WITHDRAW_PERCENT);
    });
  });
});