/*global artifacts, contract, describe, it*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const ZrxToken = artifacts.require("ZrxToken");

const {
  createSigned0xSellOrder,
  issueTokensAndSetAllowancesForClose,
  doShort,
  callCloseShort
} = require('../helpers/ShortSellHelper');

contract('ShortSell', function(accounts) {
  describe('#closeShort', () => {
    it('successfully closes a short', async () => {
      const shortTx = await doShort(accounts);
      const [sellOrder, shortSell] = await Promise.all([
        createSigned0xSellOrder(accounts),
        ShortSell.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);

      const tx = await callCloseShort(shortSell, shortTx, sellOrder);

      console.log('\tShortSell.closeShort gas used: ' + tx.receipt.gasUsed);

      const exists = await shortSell.containsShort.call(shortTx.id);
      expect(exists).to.be.false;

      // TODO simulate time between short and close
      const shortTimestamp = shortTx.response.logs.find(
        l => l.event === 'ShortInitiated'
      ).args.timestamp;
      const shortClosedTimestamp = tx.logs.find(
        l => l.event === 'ShortClosed'
      ).args.timestamp;
      const shortLifetime = shortClosedTimestamp.minus(shortTimestamp);

      const ONE_DAY_IN_SECONDS = new BigNumber(60 * 60 * 24);

      const [
        baseTokenBuyCost,
        sellTakerFee,
        baseTokenFromSell,
        buyTakerFee,
        interestFee,
        balance
      ] = await Promise.all([
        shortSell.getPartialAmount.call(
          sellOrder.takerTokenAmount,
          sellOrder.makerTokenAmount,
          shortTx.shortAmount
        ),
        shortSell.getPartialAmount.call(
          shortTx.shortAmount,
          sellOrder.makerTokenAmount,
          sellOrder.takerFee
        ),
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
        shortSell.getPartialAmount.call(
          shortTx.loanOffering.rates.interestRate,
          ONE_DAY_IN_SECONDS,
          shortLifetime
        ),
        shortSell.getShortBalance.call(shortTx.id)
      ]);

      expect(balance.equals(new BigNumber(0))).to.be.true;

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
        sellerBaseToken,
        sellerZrxToken,
        lenderBaseToken,
        lenderUnderlyingToken,
        externalSellerBaseToken,
        externalSellerUnderlyingToken,
        sellOrderFeeRecipientZrxToken
      ] = await Promise.all([
        baseToken.balanceOf.call(shortTx.seller),
        zrxToken.balanceOf.call(shortTx.seller),
        baseToken.balanceOf.call(shortTx.loanOffering.lender),
        underlyingToken.balanceOf.call(shortTx.loanOffering.lender),
        baseToken.balanceOf.call(sellOrder.maker),
        underlyingToken.balanceOf.call(sellOrder.maker),
        zrxToken.balanceOf.call(sellOrder.feeRecipient)
      ]);

      expect(
        sellerBaseToken.equals(
          shortTx.depositAmount
            .plus(baseTokenFromSell)
            .minus(baseTokenBuyCost)
            .minus(interestFee)
        )
      ).to.be.true;
      expect(
        sellerZrxToken.equals(
          shortTx.buyOrder.takerFee
            .plus(sellOrder.takerFee)
            .minus(sellTakerFee)
            .minus(buyTakerFee)
        )
      ).to.be.true;
      expect(lenderBaseToken.equals(interestFee)).to.be.true;
      expect(lenderUnderlyingToken.equals(shortTx.loanOffering.rates.maxAmount)).to.be.true;
      expect(externalSellerBaseToken.equals(baseTokenBuyCost)).to.be.true;
      expect(
        externalSellerUnderlyingToken.equals(
          sellOrder.makerTokenAmount.minus(shortTx.shortAmount)
        )
      ).to.be.true;
      expect(
        sellOrderFeeRecipientZrxToken.equals(sellTakerFee)
      ).to.be.true;
    });
  });
});
