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
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition
} = require('../helpers/MarginHelper');

let salt = DEFAULT_SALT + 1;

describe('#increasePosition', () => {
  contract('Margin', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const {
        OpenTx,
        addValueTx,
        dydxMargin,
        startingBalance,
        startingBalances,
        traderStartingQuoteToken
      } = await setup(accounts);

      const tx = await callIncreasePosition(dydxMargin, addValueTx);

      console.log(
        '\tMargin.increasePosition (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed
      );

      await validate({
        dydxMargin,
        OpenTx,
        addValueTx,
        tx,
        startingBalance,
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
        OpenTx,
        addValueTx,
        dydxMargin,
        startingBalance,
        startingBalances,
        traderStartingQuoteToken
      } = await setup(
        accounts,
        { positionOwner: testPositionOwner.address, loanOwner: testLoanOwner.address }
      );

      const tx = await callIncreasePosition(dydxMargin, addValueTx);

      const [
        positionPrincipalAdded,
        loanValueAdded
      ] = await Promise.all([
        testPositionOwner.valueAdded.call(OpenTx.id, addValueTx.trader),
        testLoanOwner.valueAdded.call(OpenTx.id, addValueTx.loanOffering.payer),
      ]);

      expect(positionPrincipalAdded).to.be.bignumber.eq(addValueTx.principal);
      expect(loanValueAdded).to.be.bignumber.eq(addValueTx.principal);

      await validate({
        dydxMargin,
        OpenTx,
        addValueTx,
        tx,
        startingBalance,
        startingBalances,
        traderStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('allows a loan offering with longer maxDuration to be used', async () => {
      const {
        OpenTx,
        addValueTx,
        dydxMargin,
        startingBalance,
        startingBalances,
        traderStartingQuoteToken
      } = await setup(accounts);

      addValueTx.loanOffering.maxDuration = addValueTx.loanOffering.maxDuration * 2;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      const tx = await callIncreasePosition(dydxMargin, addValueTx);

      await validate({
        dydxMargin,
        OpenTx,
        addValueTx,
        tx,
        startingBalance,
        startingBalances,
        traderStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('does not allow a loan offering with smaller maxDuration to be used', async () => {
      const {
        addValueTx,
        dydxMargin,
      } = await setup(accounts);

      addValueTx.loanOffering.maxDuration = addValueTx.loanOffering.maxDuration / 10;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      await expectThrow(callIncreasePosition(dydxMargin, addValueTx));
    });
  });

  contract('Margin', function(accounts) {
    it('allows a loan offering with longer callTimeLimit to be used', async () => {
      const {
        OpenTx,
        addValueTx,
        dydxMargin,
        startingBalance,
        startingBalances,
        traderStartingQuoteToken
      } = await setup(accounts);

      addValueTx.loanOffering.callTimeLimit = addValueTx.loanOffering.callTimeLimit * 2;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      const tx = await callIncreasePosition(dydxMargin, addValueTx);

      await validate({
        dydxMargin,
        OpenTx,
        addValueTx,
        tx,
        startingBalance,
        startingBalances,
        traderStartingQuoteToken
      });
    });
  });

  contract('Margin', function(accounts) {
    it('does not allow a loan offering with smaller callTimeLimit to be used', async () => {
      const {
        addValueTx,
        dydxMargin,
      } = await setup(accounts);

      addValueTx.loanOffering.callTimeLimit = addValueTx.loanOffering.callTimeLimit - 1;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);

      await expectThrow(callIncreasePosition(dydxMargin, addValueTx));
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
    const [dydxMargin, baseToken, quoteToken, feeToken] = await Promise.all([
      Margin.deployed(),
      BaseToken.deployed(),
      QuoteToken.deployed(),
      FeeToken.deployed()
    ]);
    const [
      OpenTx,
      addValueTx
    ] = await Promise.all([
      createOpenTx(accounts),
      createOpenTx(accounts, salt++)
    ]);

    if (loanOwner) {
      OpenTx.loanOffering.owner = loanOwner;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);
      addValueTx.loanOffering.owner = loanOwner;
      addValueTx.loanOffering.signature = await signLoanOffering(addValueTx.loanOffering);
    }
    if (positionOwner) {
      OpenTx.owner = positionOwner;
      addValueTx.owner = positionOwner;
    }

    await issueTokensAndSetAllowances(OpenTx);

    const response = await callOpenPosition(dydxMargin, OpenTx);
    OpenTx.id = response.id;
    OpenTx.response = response;

    const [
      startingBalance,
      startingBalances,
    ] = await Promise.all([
      dydxMargin.getPositionBalance.call(OpenTx.id),
      getBalances(OpenTx, baseToken, quoteToken, feeToken),
    ]);

    addValueTx.principal = addValueTx.principal.div(4);
    addValueTx.id = OpenTx.id;

    const traderStartingQuoteToken = OpenTx.depositAmount.times(2);
    await quoteToken.issueTo(OpenTx.trader, traderStartingQuoteToken);
    await quoteToken.approve(
      ProxyContract.address,
      traderStartingQuoteToken,
      { from: OpenTx.trader }
    );

    // Wait until the next interest period
    await wait(OpenTx.loanOffering.rates.interestPeriod.plus(1).toNumber());

    return {
      OpenTx,
      addValueTx,
      dydxMargin,
      baseToken,
      quoteToken,
      feeToken,
      startingBalance,
      startingBalances,
      traderStartingQuoteToken
    };
  }

  async function validate({
    dydxMargin,
    OpenTx,
    addValueTx,
    tx,
    startingBalance,
    startingBalances,
    traderStartingQuoteToken
  }) {
    const [
      position,
      baseToken,
      quoteToken,
      feeToken
    ]= await Promise.all([
      getPosition(dydxMargin, OpenTx.id),
      BaseToken.deployed(),
      QuoteToken.deployed(),
      FeeToken.deployed(),
    ]);

    expect(position.principal).to.be.bignumber.eq(
      OpenTx.principal.plus(addValueTx.principal)
    );

    expect(position.owner).to.eq(OpenTx.owner);
    expect(position.lender).to.eq(OpenTx.loanOffering.owner);
    expect(position.baseToken).to.eq(OpenTx.baseToken);
    expect(position.quoteToken).to.eq(OpenTx.quoteToken);
    expect(position.interestRate).to.be.bignumber.eq(OpenTx.loanOffering.rates.interestRate);
    expect(position.callTimeLimit).to.be.bignumber.eq(OpenTx.loanOffering.callTimeLimit);
    expect(position.interestPeriod).to.be.bignumber.eq(OpenTx.loanOffering.rates.interestPeriod);
    expect(position.maxDuration).to.be.bignumber.eq(OpenTx.loanOffering.maxDuration);

    const [
      finalBalance,
      lentAmount,
      finalBalances
    ] = await Promise.all([
      dydxMargin.getPositionBalance.call(OpenTx.id),
      getOwedAmount(OpenTx, tx, addValueTx.principal, false),
      getBalances(addValueTx, baseToken, quoteToken, feeToken)
    ]);

    const startingQuoteTokenPerUnit = startingBalance.div(OpenTx.principal);
    const finalQuoteTokenPerUnit = finalBalance
      .div(OpenTx.principal.plus(addValueTx.principal));

    const quoteTokenFromSell = getPartialAmount(
      addValueTx.buyOrder.makerTokenAmount,
      addValueTx.buyOrder.takerTokenAmount,
      lentAmount
    );
    const expectedDepositAmount = getPartialAmount(
      addValueTx.principal,
      OpenTx.principal,
      startingBalance,
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
        OpenTx,
        dydxMargin,
        quoteToken,
        testPositionOwner,
        testLoanOwner
      ] = await Promise.all([
        createOpenTx(accounts),
        Margin.deployed(),
        QuoteToken.deployed(),
        TestPositionOwner.new(Margin.address, "1", true),
        TestLoanOwner.new(Margin.address, "1", true),
      ]);

      OpenTx.owner = testPositionOwner.address;
      OpenTx.loanOffering.owner = testLoanOwner.address;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

      await issueTokensAndSetAllowances(OpenTx);
      const response = await callOpenPosition(dydxMargin, OpenTx);
      OpenTx.id = response.id;

      const [ownsPosition, ownsLoan, startingBalance] = await Promise.all([
        testPositionOwner.hasReceived.call(OpenTx.id, OpenTx.trader),
        testLoanOwner.hasReceived.call(OpenTx.id, OpenTx.loanOffering.payer),
        dydxMargin.getPositionBalance.call(OpenTx.id),
      ]);

      expect(ownsPosition).to.be.true;
      expect(ownsLoan).to.be.true;

      const addAmount = OpenTx.principal.div(2);
      const adder = accounts[8];
      const quoteTokenAmount = getPartialAmount(
        addAmount,
        OpenTx.principal,
        startingBalance,
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

      const tx = await dydxMargin.increasePositionDirectly(
        OpenTx.id,
        addAmount,
        { from: adder }
      );

      console.log('\tMargin.increasePositionDirectly gas used: ' + tx.receipt.gasUsed);

      const position = await getPosition(dydxMargin, OpenTx.id);

      expect(position.principal).to.be.bignumber.eq(
        OpenTx.principal.plus(addAmount)
      );

      const finalBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);
      const startingQuoteTokenPerUnit = startingBalance.div(OpenTx.principal);
      const finalQuoteTokenPerUnit = finalBalance.div(OpenTx.principal.plus(addAmount));

      expect(finalQuoteTokenPerUnit).to.be.bignumber.eq(startingQuoteTokenPerUnit);

      const [
        adderQuoteToken,
        afterIncreasePosition,
        adderLoanValueAdded
      ] = await Promise.all([
        quoteToken.balanceOf.call(adder),
        testPositionOwner.valueAdded.call(OpenTx.id, adder),
        testLoanOwner.valueAdded.call(OpenTx.id, adder),
      ]);

      expect(adderQuoteToken).to.be.bignumber.eq(0);
      expect(afterIncreasePosition).to.be.bignumber.eq(addAmount);
      expect(adderLoanValueAdded).to.be.bignumber.eq(addAmount);
    });
  });
});
