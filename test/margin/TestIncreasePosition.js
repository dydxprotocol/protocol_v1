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
const TestPositionOwner = artifacts.require("TestPositionOwner");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const { DEFAULT_SALT } = require('../helpers/Constants');
const ExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const Vault = artifacts.require("Vault");
const { getOwedAmount } = require('../helpers/ClosePositionHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

const {
  getPosition,
  callIncreasePosition,
  createMarginTradeTx,
  issueTokensAndSetAllowancesFor,
  callOpenPosition
} = require('../helpers/MarginHelper');

let salt = DEFAULT_SALT + 1;

describe('#increasePosition', () => {
  contract('Margin', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const {
        openTx,
        addValueTx,
        margin,
        startingPositionBalance,
        startingBalances,
        traderStartingQuoteToken
      } = await setup(accounts);

      const tx = await callIncreasePosition(margin, addValueTx);

      console.log(
        '\tMargin.increasePosition (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed
      );

      await validate({
        margin,
        openTx,
        addValueTx,
        tx,
        startingPositionBalance,
        startingBalances,
        traderStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('succeeds when positions are owned by contracts', async () => {
      const [
        testPositionOwner,
        testLoanOwner
      ] = await Promise.all([
        TestPositionOwner.new(Margin.address, "1", true),
        TestLoanOwner.new(Margin.address, "1", true),
      ]);

      const {
        openTx,
        addValueTx,
        margin,
        startingPositionBalance,
        startingBalances,
        traderStartingQuoteToken
      } = await setup(
        accounts,
        { positionOwner: testPositionOwner.address, loanOwner: testLoanOwner.address }
      );

      const tx = await callIncreasePosition(margin, addValueTx);

      const [
        positionIncreased,
        loanIncreased
      ] = await Promise.all([
        testPositionOwner.valueAdded.call(openTx.id, addValueTx.trader),
        testLoanOwner.valueAdded.call(openTx.id, addValueTx.loanOffering.payer),
      ]);

      expect(positionIncreased).to.be.bignumber.eq(addValueTx.amount);
      expect(loanIncreased).to.be.bignumber.eq(addValueTx.amount);

      await validate({
        margin,
        openTx,
        addValueTx,
        tx,
        startingPositionBalance,
        startingBalances,
        traderStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('allows a loan offering with longer maxDuration to be used', async () => {
      const {
        openTx,
        addValueTx,
        margin,
        startingPositionBalance,
        startingBalances,
        traderStartingQuoteToken
      } = await setup(accounts);

      addValueTx.loanOffering.maxDuration = addValueTx.loanOffering.maxDuration * 2;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      const tx = await callIncreasePosition(margin, addValueTx);

      await validate({
        margin,
        openTx,
        addValueTx,
        tx,
        startingPositionBalance,
        startingBalances,
        traderStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('does not allow a loan offering with smaller maxDuration to be used', async () => {
      const {
        addValueTx,
        margin,
      } = await setup(accounts);

      addValueTx.loanOffering.maxDuration = addValueTx.loanOffering.maxDuration / 10;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      await expectThrow( callIncreasePosition(margin, addValueTx));
    });
  });

  contract('Margin', function(accounts) {
    it('allows a loan offering with longer callTimeLimit to be used', async () => {
      const {
        openTx,
        addValueTx,
        margin,
        startingPositionBalance,
        startingBalances,
        traderStartingQuoteToken
      } = await setup(accounts);

      addValueTx.loanOffering.callTimeLimit = addValueTx.loanOffering.callTimeLimit * 2;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      const tx = await callIncreasePosition(margin, addValueTx);

      await validate({
        margin,
        openTx,
        addValueTx,
        tx,
        startingPositionBalance,
        startingBalances,
        traderStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('does not allow a loan offering with smaller callTimeLimit to be used', async () => {
      const {
        addValueTx,
        margin,
      } = await setup(accounts);

      addValueTx.loanOffering.callTimeLimit = addValueTx.loanOffering.callTimeLimit - 1;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      await expectThrow( callIncreasePosition(margin, addValueTx));
    });
  });

  async function getBalances(tx, baseToken, quoteToken, feeToken) {
    const [
      lenderBaseToken,
      makerBaseToken,
      exchangeWrapperBaseToken,
      traderQuoteToken,
      makerQuoteToken,
      vaultQuoteToken,
      lenderFeeToken,
      makerFeeToken,
      exchangeWrapperFeeToken,
      traderFeeToken
    ] = await Promise.all([
      baseToken.balanceOf.call(tx.loanOffering.payer),
      baseToken.balanceOf.call(tx.buyOrder.maker),
      baseToken.balanceOf.call(ExchangeWrapper.address),
      quoteToken.balanceOf.call(tx.trader),
      quoteToken.balanceOf.call(tx.buyOrder.maker),
      quoteToken.balanceOf.call(Vault.address),
      feeToken.balanceOf.call(tx.loanOffering.payer),
      feeToken.balanceOf.call(tx.buyOrder.maker),
      feeToken.balanceOf.call(ExchangeWrapper.address),
      feeToken.balanceOf.call(tx.trader),
    ]);

    return {
      lenderBaseToken,
      makerBaseToken,
      exchangeWrapperBaseToken,
      traderQuoteToken,
      makerQuoteToken,
      vaultQuoteToken,
      lenderFeeToken,
      makerFeeToken,
      exchangeWrapperFeeToken,
      traderFeeToken
    }
  }

  async function setup(accounts, { loanOwner, positionOwner } = {}) {
    const [margin, baseToken, quoteToken, feeToken] = await Promise.all([
      Margin.deployed(),
      BaseToken.deployed(),
      QuoteToken.deployed(),
      FeeToken.deployed()
    ]);
    const [
      openTx,
      addValueTx
    ] = await Promise.all([
      createMarginTradeTx(accounts),
      createMarginTradeTx(accounts, salt++)
    ]);

    if (loanOwner) {
      openTx.loanOffering.owner = loanOwner;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
      addValueTx.loanOffering.owner = loanOwner;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);
    }
    if (positionOwner) {
      openTx.owner = positionOwner;
      addValueTx.owner = positionOwner;
    }

    await issueTokensAndSetAllowancesFor(openTx);

    const response = await callOpenPosition(margin, openTx);
    openTx.id = response.id;
    openTx.response = response;

    const [
      startingPositionBalance,
      startingBalances,
    ] = await Promise.all([
      margin.getPositionBalance.call(openTx.id),
      getBalances(openTx, baseToken, quoteToken, feeToken),
    ]);

    addValueTx.amount = addValueTx.amount.div(4);
    addValueTx.id = openTx.id;

    const traderStartingQuoteToken = openTx.depositAmount.times(2);
    await quoteToken.issueTo(openTx.trader, traderStartingQuoteToken);
    await quoteToken.approve(
      ProxyContract.address,
      traderStartingQuoteToken,
      { from: openTx.trader }
    );

    // Wait until the next interest period
    await wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber());

    return {
      openTx,
      addValueTx,
      margin,
      baseToken,
      quoteToken,
      feeToken,
      startingPositionBalance,
      startingBalances,
      traderStartingQuoteToken
    };
  }

  async function validate({
    margin,
    openTx,
    addValueTx,
    tx,
    startingPositionBalance,
    startingBalances,
    traderStartingQuoteToken
  }) {
    const [
      position,
      baseToken,
      quoteToken,
      feeToken
    ]= await Promise.all([
      getPosition(margin, openTx.id),
      BaseToken.deployed(),
      QuoteToken.deployed(),
      FeeToken.deployed(),
    ]);

    expect(position.amount).to.be.bignumber.eq(
      openTx.amount.plus(addValueTx.amount)
    );

    expect(position.trader).to.eq(openTx.owner);
    expect(position.lender).to.eq(openTx.loanOffering.owner);
    expect(position.baseToken).to.eq(openTx.baseToken);
    expect(position.quoteToken).to.eq(openTx.quoteToken);
    expect(position.closedAmount).to.be.bignumber.eq(0);
    expect(position.callTimeLimit).to.be.bignumber.eq(openTx.loanOffering.callTimeLimit);
    expect(position.maxDuration).to.be.bignumber.eq(openTx.loanOffering.maxDuration);
    expect(position.interestRate).to.be.bignumber.eq(
      openTx.loanOffering.rates.interestRate);
    expect(position.interestPeriod).to.be.bignumber.eq(
      openTx.loanOffering.rates.interestPeriod);

    const [
      finalPositionBalance,
      lentAmount,
      finalBalances
    ] = await Promise.all([
      margin.getPositionBalance.call(openTx.id),
      getOwedAmount(openTx, tx, addValueTx.amount, false),
      getBalances(addValueTx, baseToken, quoteToken, feeToken)
    ]);

    const startingQuoteTokenPerUnit = startingPositionBalance.div(openTx.amount);
    const finalQuoteTokenPerUnit = finalPositionBalance
      .div(openTx.amount.plus(addValueTx.amount));

    const quoteTokenFromSell = getPartialAmount(
      addValueTx.buyOrder.makerTokenAmount,
      addValueTx.buyOrder.takerTokenAmount,
      lentAmount
    );
    const expectedDepositAmount = getPartialAmount(
      addValueTx.amount,
      openTx.amount,
      startingPositionBalance,
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
    expect(finalBalances.traderQuoteToken).to.be.bignumber.eq(
      traderStartingQuoteToken.minus(expectedDepositAmount)
    );
    expect(finalBalances.makerQuoteToken).to.be.bignumber.eq(
      startingBalances.makerQuoteToken.minus(quoteTokenFromSell)
    );
  }
});

describe('#increasePositionDirectly', () => {
  contract('Margin', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const [
        openTx,
        margin,
        quoteToken,
        testPositionOwner,
        testLoanOwner
      ] = await Promise.all([
        createMarginTradeTx(accounts),
        Margin.deployed(),
        QuoteToken.deployed(),
        TestPositionOwner.new(Margin.address, "1", true),
        TestLoanOwner.new(Margin.address, "1", true),
      ]);

      openTx.owner = testPositionOwner.address;
      openTx.loanOffering.owner = testLoanOwner.address;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

      await issueTokensAndSetAllowancesFor(openTx);
      const response = await callOpenPosition(margin, openTx);
      openTx.id = response.id;

      const [ownsPosition, ownsLoan, startingPositionBalance] = await Promise.all([
        testPositionOwner.hasReceived.call(openTx.id, openTx.trader),
        testLoanOwner.hasReceived.call(openTx.id, openTx.loanOffering.payer),
        margin.getPositionBalance.call(openTx.id),
      ]);

      expect(ownsPosition).to.be.true;
      expect(ownsLoan).to.be.true;

      const addAmount = openTx.amount.div(2);
      const adder = accounts[8];
      const quoteTokenAmount = getPartialAmount(
        addAmount,
        openTx.amount,
        startingPositionBalance,
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

      const tx = await margin.increasePositionDirectly(
        openTx.id,
        addAmount,
        { from: adder }
      );

      console.log('\tMargin.increasePositionDirectly gas used: ' + tx.receipt.gasUsed);

      const position = await getPosition(margin, openTx.id);

      expect(position.amount).to.be.bignumber.eq(
        openTx.amount.plus(addAmount)
      );

      const finalPositionBalance = await margin.getPositionBalance.call(openTx.id);
      const startingQuoteTokenPerUnit = startingPositionBalance.div(openTx.amount);
      const finalQuoteTokenPerUnit =
        finalPositionBalance.div(openTx.amount.plus(addAmount));

      expect(finalQuoteTokenPerUnit).to.be.bignumber.eq(startingQuoteTokenPerUnit);

      const [
        adderQuoteToken,
        adderPositionIncreased,
        adderLoanIncreased
      ] = await Promise.all([
        quoteToken.balanceOf.call(adder),
        testPositionOwner.valueAdded.call(openTx.id, adder),
        testLoanOwner.valueAdded.call(openTx.id, adder),
      ]);

      expect(adderQuoteToken).to.be.bignumber.eq(0);
      expect(adderPositionIncreased).to.be.bignumber.eq(addAmount);
      expect(adderLoanIncreased).to.be.bignumber.eq(addAmount);
    });
  });
});
