/*global artifacts, web3, contract, describe, it*/

const expect = require('chai').expect;
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const ZrxToken = artifacts.require("ZrxToken");
const Vault = artifacts.require("Vault");

const web3Instance = new Web3(web3.currentProvider);

const {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort
} = require('../helpers/ShortSellHelper');

contract('ShortSell', function(accounts) {
  describe('#short', () => {
    it('short succeeds on valid inputs', async () => {
      const shortTx = await createShortSellTx(accounts);
      const shortSell = await ShortSell.deployed();

      await issueTokensAndSetAllowancesForShort(shortTx);

      const tx = await callShort(shortSell, shortTx);

      console.log('\tShortSell.short gas used: ' + tx.receipt.gasUsed);

      const shortId = web3Instance.utils.soliditySha3(
        shortTx.loanOffering.lender,
        0
      );

      const contains = await shortSell.containsShort.call(shortId);
      expect(contains).to.equal(true);
      const [
        underlyingTokenAddress,
        baseTokenAddress,
        shortAmount,
        interestRate,
        callTimeLimit,
        lockoutTime,
        ,
        ,
        lender,
        seller,
      ] = await shortSell.getShort.call(shortId);

      expect(underlyingTokenAddress).to.equal(shortTx.underlyingToken);
      expect(baseTokenAddress).to.equal(shortTx.baseToken);
      expect(shortAmount.equals(shortTx.shortAmount)).to.equal(true);
      expect(interestRate.equals(shortTx.loanOffering.rates.interestRate)).to.equal(true);
      expect(callTimeLimit.equals(shortTx.loanOffering.callTimeLimit)).to.equal(true);
      expect(lockoutTime.equals(shortTx.loanOffering.lockoutTime)).to.equal(true);
      expect(lender).to.equal(shortTx.loanOffering.lender);
      expect(seller).to.equal(shortTx.seller);

      const [
        baseTokenFromSell,
        buyTakerFee,
        balance
      ] = await Promise.all([
        shortSell.getPartialAmount.call(
          shortTx.buyOrder.makerTokenAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.shortAmount
        ),
        shortSell.getPartialAmount.call(
          shortTx.shortAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.buyOrder.takerFee
        ),
        shortSell.getShortBalance.call(shortId)
      ]);

      expect(balance.equals(baseTokenFromSell.plus(shortTx.depositAmount))).to.equal(true);
      const [
        underlyingToken,
        baseToken,
        zrxToken
      ] = await Promise.all([
        UnderlyingToken.deployed(),
        BaseToken.deployed(),
        ZrxToken.deployed()
      ]);

      const [
        lenderUnderlyingToken,
        makerUnderlyingToken,
        vaultUnderlyingToken,
        sellerBaseToken,
        makerBaseToken,
        vaultBaseToken,
        vaultZrxToken,
        sellerZrxToken,
        buyOrderFeeRecipientZrxToken
      ] = await Promise.all([
        underlyingToken.balanceOf.call(shortTx.loanOffering.lender),
        underlyingToken.balanceOf.call(shortTx.buyOrder.maker),
        underlyingToken.balanceOf.call(Vault.address),
        baseToken.balanceOf.call(shortTx.seller),
        baseToken.balanceOf.call(shortTx.buyOrder.maker),
        baseToken.balanceOf.call(Vault.address),
        zrxToken.balanceOf.call(Vault.address),
        zrxToken.balanceOf.call(shortTx.seller),
        zrxToken.balanceOf.call(shortTx.buyOrder.feeRecipient)
      ]);

      expect(
        lenderUnderlyingToken.equals(
          shortTx.loanOffering.rates.maxAmount.minus(shortTx.shortAmount)
        )
      ).to.be.true;
      expect(makerUnderlyingToken.equals(shortTx.shortAmount)).to.be.true;
      expect(vaultUnderlyingToken.equals(new BigNumber(0))).to.be.true;
      expect(sellerBaseToken.equals(new BigNumber(0))).to.be.true;
      expect(
        makerBaseToken.equals(
          shortTx.buyOrder.makerTokenAmount.minus(baseTokenFromSell)
        )
      ).to.be.true;
      expect(
        vaultBaseToken.equals(baseTokenFromSell.plus(shortTx.depositAmount))
      ).to.be.true;
      expect(vaultZrxToken.equals(new BigNumber(0))).to.be.true;
      expect(
        sellerZrxToken.equals(shortTx.buyOrder.takerFee.minus(buyTakerFee))
      ).to.be.true;
      expect(buyOrderFeeRecipientZrxToken.equals(buyTakerFee)).to.be.true;
    });
  });
});
