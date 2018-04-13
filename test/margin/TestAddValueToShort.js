/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const { wait } = require('@digix/tempo')(web3);

const Margin = artifacts.require("Margin");
const QuoteToken = artifacts.require("TokenA");
const BaseToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ProxyContract = artifacts.require("Proxy");
const TestShortOwner = artifacts.require("TestShortOwner");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const { DEFAULT_SALT } = require('../helpers/Constants');
const ExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const Vault = artifacts.require("Vault");
const { getOwedAmount } = require('../helpers/CloseShortHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

const {
  getShort,
  callAddValueToShort,
  createShortTx,
  issueTokensAndSetAllowancesForShort,
  callShort
} = require('../helpers/MarginHelper');

let salt = DEFAULT_SALT + 1;

describe('#addValueToShort', () => {
  contract('Margin', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const {
        shortTx,
        addValueTx,
        dydxMargin,
        startingShortBalance,
        startingBalances,
        sellerStartingQuoteToken
      } = await setup(accounts);

      const tx = await callAddValueToShort(dydxMargin, addValueTx);

      console.log(
        '\tMargin.addValueToShort (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed
      );

      await validate({
        dydxMargin,
        shortTx,
        addValueTx,
        tx,
        startingShortBalance,
        startingBalances,
        sellerStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('succeeds when positions are owned by contracts', async () => {
      const [
        testShortOwner,
        testLoanOwner
      ] = await Promise.all([
        TestShortOwner.new(Margin.address, "1", true),
        TestLoanOwner.new(Margin.address, "1", true),
      ]);

      const {
        shortTx,
        addValueTx,
        dydxMargin,
        startingShortBalance,
        startingBalances,
        sellerStartingQuoteToken
      } = await setup(
        accounts,
        { shortOwner: testShortOwner.address, loanOwner: testLoanOwner.address }
      );

      const tx = await callAddValueToShort(dydxMargin, addValueTx);

      const [
        shortValueAdded,
        loanValueAdded
      ] = await Promise.all([
        testShortOwner.valueAdded.call(shortTx.id, addValueTx.seller),
        testLoanOwner.valueAdded.call(shortTx.id, addValueTx.loanOffering.payer),
      ]);

      expect(shortValueAdded).to.be.bignumber.eq(addValueTx.shortAmount);
      expect(loanValueAdded).to.be.bignumber.eq(addValueTx.shortAmount);

      await validate({
        dydxMargin,
        shortTx,
        addValueTx,
        tx,
        startingShortBalance,
        startingBalances,
        sellerStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('allows a loan offering with longer maxDuration to be used', async () => {
      const {
        shortTx,
        addValueTx,
        dydxMargin,
        startingShortBalance,
        startingBalances,
        sellerStartingQuoteToken
      } = await setup(accounts);

      addValueTx.loanOffering.maxDuration = addValueTx.loanOffering.maxDuration * 2;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      const tx = await callAddValueToShort(dydxMargin, addValueTx);

      await validate({
        dydxMargin,
        shortTx,
        addValueTx,
        tx,
        startingShortBalance,
        startingBalances,
        sellerStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('does not allow a loan offering with shorter maxDuration to be used', async () => {
      const {
        addValueTx,
        dydxMargin,
      } = await setup(accounts);

      addValueTx.loanOffering.maxDuration = addValueTx.loanOffering.maxDuration / 10;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      await expectThrow( callAddValueToShort(dydxMargin, addValueTx));
    });
  });

  contract('Margin', function(accounts) {
    it('allows a loan offering with longer callTimeLimit to be used', async () => {
      const {
        shortTx,
        addValueTx,
        dydxMargin,
        startingShortBalance,
        startingBalances,
        sellerStartingQuoteToken
      } = await setup(accounts);

      addValueTx.loanOffering.callTimeLimit = addValueTx.loanOffering.callTimeLimit * 2;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      const tx = await callAddValueToShort(dydxMargin, addValueTx);

      await validate({
        dydxMargin,
        shortTx,
        addValueTx,
        tx,
        startingShortBalance,
        startingBalances,
        sellerStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('does not allow a loan offering with shorter callTimeLimit to be used', async () => {
      const {
        addValueTx,
        dydxMargin,
      } = await setup(accounts);

      addValueTx.loanOffering.callTimeLimit = addValueTx.loanOffering.callTimeLimit - 1;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      await expectThrow( callAddValueToShort(dydxMargin, addValueTx));
    });
  });

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
      baseToken.balanceOf.call(tx.loanOffering.payer),
      baseToken.balanceOf.call(tx.buyOrder.maker),
      baseToken.balanceOf.call(ExchangeWrapper.address),
      quoteToken.balanceOf.call(tx.seller),
      quoteToken.balanceOf.call(tx.buyOrder.maker),
      quoteToken.balanceOf.call(Vault.address),
      feeToken.balanceOf.call(tx.loanOffering.payer),
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

  async function setup(accounts, { loanOwner, shortOwner } = {}) {
    const [dydxMargin, baseToken, quoteToken, feeToken] = await Promise.all([
      Margin.deployed(),
      BaseToken.deployed(),
      QuoteToken.deployed(),
      FeeToken.deployed()
    ]);
    const [
      shortTx,
      addValueTx
    ] = await Promise.all([
      createShortTx(accounts),
      createShortTx(accounts, salt++)
    ]);

    if (loanOwner) {
      shortTx.loanOffering.owner = loanOwner;
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);
      addValueTx.loanOffering.owner = loanOwner;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);
    }
    if (shortOwner) {
      shortTx.owner = shortOwner;
      addValueTx.owner = shortOwner;
    }

    await issueTokensAndSetAllowancesForShort(shortTx);

    const response = await callShort(dydxMargin, shortTx);
    shortTx.id = response.id;
    shortTx.response = response;

    const [
      startingShortBalance,
      startingBalances,
    ] = await Promise.all([
      dydxMargin.getShortBalance.call(shortTx.id),
      getBalances(shortTx, baseToken, quoteToken, feeToken),
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
      dydxMargin,
      baseToken,
      quoteToken,
      feeToken,
      startingShortBalance,
      startingBalances,
      sellerStartingQuoteToken
    };
  }

  async function validate({
    dydxMargin,
    shortTx,
    addValueTx,
    tx,
    startingShortBalance,
    startingBalances,
    sellerStartingQuoteToken
  }) {
    const [
      short,
      baseToken,
      quoteToken,
      feeToken
    ]= await Promise.all([
      getShort(dydxMargin, shortTx.id),
      BaseToken.deployed(),
      QuoteToken.deployed(),
      FeeToken.deployed(),
    ]);

    expect(short.shortAmount).to.be.bignumber.eq(
      shortTx.shortAmount.plus(addValueTx.shortAmount)
    );

    expect(short.seller).to.eq(shortTx.owner);
    expect(short.lender).to.eq(shortTx.loanOffering.owner);
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
      dydxMargin.getShortBalance.call(shortTx.id),
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
  }
});

describe('#addValueToShortDirectly', () => {
  contract('Margin', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const [
        shortTx,
        dydxMargin,
        quoteToken,
        testShortOwner,
        testLoanOwner
      ] = await Promise.all([
        createShortTx(accounts),
        Margin.deployed(),
        QuoteToken.deployed(),
        TestShortOwner.new(Margin.address, "1", true),
        TestLoanOwner.new(Margin.address, "1", true),
      ]);

      shortTx.owner = testShortOwner.address;
      shortTx.loanOffering.owner = testLoanOwner.address;
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

      await issueTokensAndSetAllowancesForShort(shortTx);
      const response = await callShort(dydxMargin, shortTx);
      shortTx.id = response.id;

      const [ownsShort, ownsLoan, startingShortBalance] = await Promise.all([
        testShortOwner.hasReceived.call(shortTx.id, shortTx.seller),
        testLoanOwner.hasReceived.call(shortTx.id, shortTx.loanOffering.payer),
        dydxMargin.getShortBalance.call(shortTx.id),
      ]);

      expect(ownsShort).to.be.true;
      expect(ownsLoan).to.be.true;

      const addAmount = shortTx.shortAmount.div(2);
      const adder = accounts[8];
      const quoteTokenAmount = getPartialAmount(
        addAmount,
        shortTx.shortAmount,
        startingShortBalance,
        true
      );

      await quoteToken.issueTo(
        adder,
        quoteTokenAmount
      );
      await quoteToken.approve(
        ProxyContract.address,
        quoteTokenAmount,
        { from: adder }
      );

      const tx = await dydxMargin.addValueToShortDirectly(
        shortTx.id,
        addAmount,
        { from: adder }
      );

      console.log('\tMargin.addValueToShortDirectly gas used: ' + tx.receipt.gasUsed);

      const short = await getShort(dydxMargin, shortTx.id);

      expect(short.shortAmount).to.be.bignumber.eq(
        shortTx.shortAmount.plus(addAmount)
      );

      const finalShortBalance = await dydxMargin.getShortBalance.call(shortTx.id);
      const startingQuoteTokenPerUnit = startingShortBalance.div(shortTx.shortAmount);
      const finalQuoteTokenPerUnit = finalShortBalance.div(shortTx.shortAmount.plus(addAmount));

      expect(finalQuoteTokenPerUnit).to.be.bignumber.eq(startingQuoteTokenPerUnit);

      const [
        adderQuoteToken,
        adderShortValueAdded,
        adderLoanValueAdded
      ] = await Promise.all([
        quoteToken.balanceOf.call(adder),
        testShortOwner.valueAdded.call(shortTx.id, adder),
        testLoanOwner.valueAdded.call(shortTx.id, adder),
      ]);

      expect(adderQuoteToken).to.be.bignumber.eq(0);
      expect(adderShortValueAdded).to.be.bignumber.eq(addAmount);
      expect(adderLoanValueAdded).to.be.bignumber.eq(addAmount);
    });
  });
});
