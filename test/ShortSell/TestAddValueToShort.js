/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const { wait } = require('@digix/tempo')(web3);

const ShortSell = artifacts.require("ShortSell");
const QuoteToken = artifacts.require("TokenA");
const BaseToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ProxyContract = artifacts.require("Proxy");
const { DEFAULT_SALT } = require('../helpers/Constants');
const ExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const Vault = artifacts.require("Vault");
const { getOwedAmount } = require('../helpers/CloseShortHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

const {
  doShort,
  getShort,
  callAddValueToShort,
  createShortSellTx
} = require('../helpers/ShortSellHelper');

let salt = DEFAULT_SALT + 1;

describe('#addValueToShort', () => {
  contract('ShortSell', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const {
        shortTx,
        addValueTx,
        shortSell,
        baseToken,
        quoteToken,
        feeToken,
        startingShortBalance,
        startingBalances,
        sellerStartingQuoteToken
      } = await setup(accounts);

      const tx = await callAddValueToShort(shortSell, addValueTx);

      console.log(
        '\tShortSell.addValueToShort (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed
      );

      const short = await getShort(shortSell, shortTx.id);

      expect(short.shortAmount).to.be.bignumber.eq(
        shortTx.shortAmount.plus(addValueTx.shortAmount)
      );

      expect(short.seller).to.eq(shortTx.owner);
      expect(short.lender).to.eq(shortTx.loanOffering.lender);
      expect(short.baseToken).to.eq(shortTx.baseToken);
      expect(short.quoteToken).to.eq(shortTx.quoteToken);
      expect(short.closedAmount).to.be.bignumber.eq(0);
      expect(short.interestRate).to.be.bignumber.eq(shortTx.loanOffering.rates.interestRate);
      expect(short.callTimeLimit).to.be.bignumber.eq(shortTx.loanOffering.callTimeLimit);
      expect(short.interestPeriod).to.be.bignumber.eq(shortTx.loanOffering.rates.interestPeriod);
      expect(short.maxDuration).to.be.bignumber.eq(shortTx.loanOffering.maxDuration);

      const [
        finalShortBalance,
        lentAmount,
        finalBalances
      ] = await Promise.all([
        shortSell.getShortBalance.call(shortTx.id),
        getOwedAmount(shortTx, tx, addValueTx.shortAmount, false),
        getBalances(addValueTx, baseToken, quoteToken, feeToken)
      ]);

      const startingQuoteTokenPerUnit = startingShortBalance.div(shortTx.shortAmount);
      const finalQuoteTokenPerUnit = finalShortBalance
        .div(shortTx.shortAmount.plus(addValueTx.shortAmount));

      const quoteTokenFromSell = getPartialAmount(
        addValueTx.buyOrder.makerTokenAmount,
        addValueTx.buyOrder.takerTokenAmount,
        lentAmount
      );
      const expectedDepositAmount = getPartialAmount(
        addValueTx.shortAmount,
        shortTx.shortAmount,
        startingShortBalance,
        true // round up
      ).minus(quoteTokenFromSell);

      expect(startingQuoteTokenPerUnit).to.be.bignumber.eq(finalQuoteTokenPerUnit);

      expect(finalBalances.lenderBaseToken).to.be.bignumber.eq(
        startingBalances.lenderBaseToken.minus(lentAmount)
      );
      expect(finalBalances.makerBaseToken).to.be.bignumber.eq(
        startingBalances.makerBaseToken.plus(lentAmount)
      );
      expect(finalBalances.exchangeWrapperBaseToken).to.be.bignumber.eq(0);
      expect(finalBalances.sellerQuoteToken).to.be.bignumber.eq(
        sellerStartingQuoteToken.minus(expectedDepositAmount)
      );
      expect(finalBalances.makerQuoteToken).to.be.bignumber.eq(
        startingBalances.makerQuoteToken.minus(quoteTokenFromSell)
      );
    });
  });

  contract('ShortSell', function(accounts) {
    it('allows a loan offering with longer maxDuration to be used', async () => {
      const {
        shortTx,
        addValueTx,
        shortSell,
      } = await setup(accounts);

      addValueTx.loanOffering.maxDuration = addValueTx.loanOffering.maxDuration * 2;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      await callAddValueToShort(shortSell, addValueTx);

      const short = await getShort(shortSell, shortTx.id);

      expect(short.shortAmount).to.be.bignumber.eq(
        shortTx.shortAmount.plus(addValueTx.shortAmount)
      );
    });
  });

  contract('ShortSell', function(accounts) {
    it('does not allow a loan offering with shorter maxDuration to be used', async () => {
      const {
        addValueTx,
        shortSell,
      } = await setup(accounts);

      addValueTx.loanOffering.maxDuration = addValueTx.loanOffering.maxDuration / 10;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      await expectThrow(() => callAddValueToShort(shortSell, addValueTx));
    });
  });

  contract('ShortSell', function(accounts) {
    it('allows a loan offering with longer callTimeLimit to be used', async () => {
      const {
        shortTx,
        addValueTx,
        shortSell,
      } = await setup(accounts);

      addValueTx.loanOffering.callTimeLimit = addValueTx.loanOffering.callTimeLimit * 2;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      await callAddValueToShort(shortSell, addValueTx);

      const short = await getShort(shortSell, shortTx.id);

      expect(short.shortAmount).to.be.bignumber.eq(
        shortTx.shortAmount.plus(addValueTx.shortAmount)
      );
    });
  });

  contract('ShortSell', function(accounts) {
    it('does not allow a loan offering with shorter callTimeLimit to be used', async () => {
      const {
        addValueTx,
        shortSell,
      } = await setup(accounts);

      addValueTx.loanOffering.callTimeLimit = addValueTx.loanOffering.callTimeLimit - 1;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      await expectThrow(() => callAddValueToShort(shortSell, addValueTx));
    });
  });
});

async function setup(accounts) {
  const shortTx = await doShort(accounts);
  const [shortSell, baseToken, quoteToken, feeToken] = await Promise.all([
    ShortSell.deployed(),
    BaseToken.deployed(),
    QuoteToken.deployed(),
    FeeToken.deployed()
  ]);

  const [
    startingShortBalance,
    startingBalances,
    addValueTx
  ] = await Promise.all([
    shortSell.getShortBalance.call(shortTx.id),
    getBalances(shortTx, baseToken, quoteToken, feeToken),
    createShortSellTx(accounts, salt++)
  ]);

  addValueTx.shortAmount = addValueTx.shortAmount.div(4);
  addValueTx.id = shortTx.id;

  const sellerStartingQuoteToken = shortTx.depositAmount.times(2);
  await quoteToken.issueTo(shortTx.seller, sellerStartingQuoteToken);
  await quoteToken.approve(
    ProxyContract.address,
    sellerStartingQuoteToken,
    { from: shortTx.seller }
  );

  // Wait until the next interest period
  await wait(shortTx.loanOffering.rates.interestPeriod.plus(1).toNumber());

  return {
    shortTx,
    addValueTx,
    shortSell,
    baseToken,
    quoteToken,
    feeToken,
    startingShortBalance,
    startingBalances,
    sellerStartingQuoteToken
  };
}

async function getBalances(tx, baseToken, quoteToken, feeToken) {
  const [
    lenderBaseToken,
    makerBaseToken,
    exchangeWrapperBaseToken,
    sellerQuoteToken,
    makerQuoteToken,
    vaultQuoteToken,
    lenderFeeToken,
    makerFeeToken,
    exchangeWrapperFeeToken,
    sellerFeeToken
  ] = await Promise.all([
    baseToken.balanceOf.call(tx.loanOffering.lender),
    baseToken.balanceOf.call(tx.buyOrder.maker),
    baseToken.balanceOf.call(ExchangeWrapper.address),
    quoteToken.balanceOf.call(tx.seller),
    quoteToken.balanceOf.call(tx.buyOrder.maker),
    quoteToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(tx.loanOffering.lender),
    feeToken.balanceOf.call(tx.buyOrder.maker),
    feeToken.balanceOf.call(ExchangeWrapper.address),
    feeToken.balanceOf.call(tx.seller),
  ]);

  return {
    lenderBaseToken,
    makerBaseToken,
    exchangeWrapperBaseToken,
    sellerQuoteToken,
    makerQuoteToken,
    vaultQuoteToken,
    lenderFeeToken,
    makerFeeToken,
    exchangeWrapperFeeToken,
    sellerFeeToken
  }
}
