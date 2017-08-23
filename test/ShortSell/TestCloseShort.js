/*global artifacts, contract, describe, it*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");

const {
  createSigned0xSellOrder,
  issueTokensAndSetAllowancesForClose,
  doShort,
  callCloseShort,
  getPartialAmount
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

      const balance = await shortSell.getShortBalance.call(shortTx.id);

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
      const interestFee = getPartialAmount(
        shortTx.loanOffering.rates.interestRate,
        ONE_DAY_IN_SECONDS,
        shortLifetime
      );
      const baseTokenBuybackCost = getPartialAmount(
        sellOrder.takerTokenAmount,
        sellOrder.makerTokenAmount.minus(sellOrder.takerFee),
        shortTx.shortAmount
      );
      const sellOrderTakerFee = getPartialAmount(
        baseTokenBuybackCost,
        sellOrder.takerTokenAmount,
        sellOrder.takerFee
      );

      expect(balance.equals(new BigNumber(0))).to.be.true;

      const [
        underlyingToken,
        baseToken
      ] = await Promise.all([
        UnderlyingToken.deployed(),
        BaseToken.deployed(),
      ]);

      const [
        sellerBaseToken,
        lenderBaseToken,
        lenderUnderlyingToken,
        externalSellerBaseToken,
        externalSellerUnderlyingToken
      ] = await Promise.all([
        baseToken.balanceOf.call(shortTx.seller),
        baseToken.balanceOf.call(shortTx.loanOffering.lender),
        underlyingToken.balanceOf.call(shortTx.loanOffering.lender),
        baseToken.balanceOf.call(sellOrder.maker),
        underlyingToken.balanceOf.call(sellOrder.maker)
      ]);

      expect(
        sellerBaseToken.equals(
          shortTx.depositAmount
            .plus(baseTokenFromSell)
            .minus(baseTokenBuybackCost)
            .minus(interestFee)
            .minus(buyTakerFee)
        )
      ).to.be.true;
      expect(lenderBaseToken.equals(interestFee)).to.be.true;
      expect(lenderUnderlyingToken.equals(shortTx.loanOffering.rates.maxAmount)).to.be.true;
      expect(externalSellerBaseToken.equals(baseTokenBuybackCost)).to.be.true;
      expect(
        externalSellerUnderlyingToken.equals(
          sellOrder.makerTokenAmount.minus(shortTx.shortAmount).minus(sellOrderTakerFee)
        )
      ).to.be.true;
    });
  });
});
