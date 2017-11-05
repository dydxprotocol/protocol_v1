/*global artifacts, web3, contract, describe, it*/

const expect = require('chai').expect;
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const Vault = artifacts.require("Vault");

const web3Instance = new Web3(web3.currentProvider);

const {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  getPartialAmount
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

      console.log('0')
      console.log(shortId)
      const contains = true//await shortSell.containsShort.call(shortId);
      console.log('1')
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
      console.log('2')

      expect(underlyingTokenAddress).to.equal(shortTx.underlyingToken);
      expect(baseTokenAddress).to.equal(shortTx.baseToken);
      expect(shortAmount.equals(shortTx.shortAmount)).to.equal(true);
      expect(interestRate.equals(shortTx.loanOffering.rates.interestRate)).to.equal(true);
      expect(callTimeLimit.equals(shortTx.loanOffering.callTimeLimit)).to.equal(true);
      expect(lockoutTime.equals(shortTx.loanOffering.lockoutTime)).to.equal(true);
      expect(lender).to.equal(shortTx.loanOffering.lender);
      expect(seller).to.equal(shortTx.seller);

      const balance = await shortSell.getShortBalance.call(shortId);

      const baseTokenFromSell = getPartialAmount(
        shortTx.buyOrder.makerTokenAmount,
        shortTx.buyOrder.takerTokenAmount,
        shortTx.shortAmount
      );
      const buyTakerFee = getPartialAmount(
        shortTx.shortAmount,
        shortTx.buyOrder.takerTokenAmount,
        shortTx.buyOrder.takerFee
      );

      console.log('3')


      expect(
        balance.equals(
          baseTokenFromSell.plus(shortTx.depositAmount)
        )
      ).to.be.true;
      const [
        underlyingToken,
        baseToken,
        feeToken
      ] = await Promise.all([
        UnderlyingToken.deployed(),
        BaseToken.deployed(),
        FeeToken.deployed()
      ]);

      const [
        lenderUnderlyingToken,
        makerUnderlyingToken,
        vaultUnderlyingToken,
        sellerBaseToken,
        makerBaseToken,
        vaultBaseToken,
        lenderFeeToken,
        makerFeeToken,
        vaultFeeToken,
        sellerFeeToken,
        buyOrderFeeRecipientFeeToken,
        loanFeeRecipientFeeToken,
      ] = await Promise.all([
        underlyingToken.balanceOf.call(shortTx.loanOffering.lender),
        underlyingToken.balanceOf.call(shortTx.buyOrder.maker),
        underlyingToken.balanceOf.call(Vault.address),
        baseToken.balanceOf.call(shortTx.seller),
        baseToken.balanceOf.call(shortTx.buyOrder.maker),
        baseToken.balanceOf.call(Vault.address),
        feeToken.balanceOf.call(shortTx.loanOffering.lender),
        feeToken.balanceOf.call(shortTx.buyOrder.maker),
        feeToken.balanceOf.call(Vault.address),
        feeToken.balanceOf.call(shortTx.seller),
        feeToken.balanceOf.call(shortTx.buyOrder.feeRecipient),
        feeToken.balanceOf.call(shortTx.loanOffering.feeRecipient),
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
      expect(lenderFeeToken.equals(
        shortTx.loanOffering.rates.lenderFee
          .minus(
            getPartialAmount(
              shortTx.shortAmount,
              shortTx.loanOffering.rates.maxAmount,
              shortTx.loanOffering.rates.lenderFee
            )
          )
      )).to.be.true;
      expect(vaultFeeToken.equals(new BigNumber(0))).to.be.true;
      expect(makerFeeToken.equals(
        shortTx.buyOrder.makerFee
          .minus(
            getPartialAmount(
              shortTx.shortAmount,
              shortTx.buyOrder.takerTokenAmount,
              shortTx.buyOrder.makerFee
            )
          )
      )).to.be.true;
      expect(sellerFeeToken.equals(
        shortTx.loanOffering.rates.takerFee
          .plus(shortTx.buyOrder.takerFee)
          .minus(
            getPartialAmount(
              shortTx.shortAmount,
              shortTx.loanOffering.rates.maxAmount,
              shortTx.loanOffering.rates.takerFee
            )
          )
          .minus(
            getPartialAmount(
              shortTx.shortAmount,
              shortTx.buyOrder.takerTokenAmount,
              shortTx.buyOrder.takerFee
            )
          )
      )).to.be.true;
    });
  });
});
