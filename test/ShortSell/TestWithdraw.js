const ShortSell = artifacts.require('ShortSell');
const ERC20Short = artifacts.require('ERC20Short');
const ERC20 = artifacts.require('ERC20');
const { doShort } = require('../helpers/ShortSellHelper');
const { ADDRESSES } = require('../helpers/Constants');

describe('#withdraw', () => {
  contract('ShortSell', function(accounts) {
    // Using same accounts as TestERC20Short.js
    const initialHolder = accounts[9];

    it('allows the lender to withdraw base tokens', async () => {
      const shortSell = await ShortSell.deployed();
      // Enter into a short
      const shortTx = await doShort(accounts);
      // Deploy an ERC20 short token
      const erc20Short = await ERC20Short.new(shortTx.id, shortSell.address, initialHolder, [
        ADDRESSES.TEST[1],
        ADDRESSES.TEST[2]
      ]);
      // Transfer the short position from the short seller to the ERC20 short token
      await shortSell.transferShort(shortTx.id, erc20Short.address, { from: shortTx.seller });

      const totalSupply = await erc20Short.totalSupply();
      const transferAmount = totalSupply.toNumber() / 5;
      const lender = shortTx.loanOffering.lender;

      // Transfer some of the short position to the lender
      await erc20Short.transfer(lender, transferAmount, { from: initialHolder });
      const lenderShortBalanceBefore = await erc20Short.balanceOf(lender);
      console.log(lenderShortBalanceBefore.toNumber());

      const baseToken = await ERC20.at(shortTx.baseToken);
      const lenderBaseBalanceBefore = await baseToken.balanceOf(lender);
      console.log(lenderBaseBalanceBefore.toNumber());

      // Withdraw base tokens by burning short tokens
      await shortSell.withdraw(shortTx.id, lenderShortBalanceBefore.toNumber(), { from: lender });

      const lenderShortBalanceAfter = await erc20Short.balanceOf(lender);
      console.log(lenderShortBalanceAfter.toNumber());

      const lenderBaseBalanceAfter = await baseToken.balanceOf(lender);
      console.log(lenderBaseBalanceAfter.toNumber());
    });
  });
});