/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const { wait } = require('@digix/tempo')(web3);

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
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
        startingBalances
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
        startingBalances
      });
    });
  });

  contract('Margin', function(accounts) {
    it('succeeds when depositing in owedToken', async () => {
      const {
        OpenTx,
        addValueTx,
        dydxMargin,
        startingBalance,
        startingBalances
      } = await setup(accounts, { depositInHeldToken: false });

      const tx = await callIncreasePosition(dydxMargin, addValueTx);

      await validate({
        dydxMargin,
        OpenTx,
        addValueTx,
        tx,
        startingBalance,
        startingBalances
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
        startingBalances
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
        startingBalances
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
        startingBalances
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
        startingBalances
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
        startingBalances
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
        startingBalances
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

  async function getBalances(tx, owedToken, heldToken, feeToken) {
    const [
      traderOwedToken,
      lenderOwedToken,
      makerOwedToken,
      exchangeWrapperOwedToken,
      traderHeldToken,
      makerHeldToken,
      vaultHeldToken,
      exchangeWrapperHeldToken,
      lenderFeeToken,
      makerFeeToken,
      exchangeWrapperFeeToken,
      traderFeeToken
    ] = await Promise.all([
      owedToken.balanceOf.call(tx.trader),
      owedToken.balanceOf.call(tx.loanOffering.payer),
      owedToken.balanceOf.call(tx.buyOrder.maker),
      owedToken.balanceOf.call(ExchangeWrapper.address),
      heldToken.balanceOf.call(tx.trader),
      heldToken.balanceOf.call(tx.buyOrder.maker),
      heldToken.balanceOf.call(Vault.address),
      heldToken.balanceOf.call(ExchangeWrapper.address),
      feeToken.balanceOf.call(tx.loanOffering.payer),
      feeToken.balanceOf.call(tx.buyOrder.maker),
      feeToken.balanceOf.call(ExchangeWrapper.address),
      feeToken.balanceOf.call(tx.trader),
    ]);

    return {
      traderOwedToken,
      lenderOwedToken,
      makerOwedToken,
      exchangeWrapperOwedToken,
      traderHeldToken,
      makerHeldToken,
      vaultHeldToken,
      exchangeWrapperHeldToken,
      lenderFeeToken,
      makerFeeToken,
      exchangeWrapperFeeToken,
      traderFeeToken
    }
  }

  async function setup(accounts, { loanOwner, positionOwner, depositInHeldToken } = {}) {
    if (depositInHeldToken === undefined) {
      depositInHeldToken = true;
    }

    const [dydxMargin, owedToken, heldToken, feeToken] = await Promise.all([
      Margin.deployed(),
      OwedToken.deployed(),
      HeldToken.deployed(),
      FeeToken.deployed()
    ]);
    const [
      OpenTx,
      addValueTx
    ] = await Promise.all([
      createOpenTx(accounts),
      createOpenTx(accounts, salt++, depositInHeldToken)
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

    let issueDepositPromise;

    if (depositInHeldToken) {
      issueDepositPromise = Promise.all([
        heldToken.issueTo(OpenTx.trader, addValueTx.depositAmount),
        heldToken.approve(
          ProxyContract.address,
          addValueTx.depositAmount,
          { from: OpenTx.trader }
        )
      ]);
    } else {
      issueDepositPromise = Promise.all([
        owedToken.issueTo(
          addValueTx.trader,
          addValueTx.depositAmount
        ),
        owedToken.approve(
          ProxyContract.address,
          addValueTx.depositAmount,
          { from: addValueTx.trader }
        )
      ]);
    }

    await issueDepositPromise;

    OpenTx.id = response.id;
    OpenTx.response = response;

    const [
      startingBalance,
      startingBalances,
    ] = await Promise.all([
      dydxMargin.getPositionBalance.call(OpenTx.id),
      getBalances(OpenTx, owedToken, heldToken, feeToken),
    ]);

    addValueTx.principal = addValueTx.principal.div(4);
    addValueTx.id = OpenTx.id;

    // Wait until the next interest period
    await wait(OpenTx.loanOffering.rates.interestPeriod.plus(1).toNumber());

    return {
      OpenTx,
      addValueTx,
      dydxMargin,
      owedToken,
      heldToken,
      feeToken,
      startingBalance,
      startingBalances
    };
  }

  async function validate({
    dydxMargin,
    OpenTx,
    addValueTx,
    tx,
    startingBalance,
    startingBalances
  }) {
    const [
      position,
      owedToken,
      heldToken,
      feeToken
    ]= await Promise.all([
      getPosition(dydxMargin, OpenTx.id),
      OwedToken.deployed(),
      HeldToken.deployed(),
      FeeToken.deployed(),
    ]);

    expect(position.principal).to.be.bignumber.eq(
      OpenTx.principal.plus(addValueTx.principal)
    );

    expect(position.owner).to.eq(OpenTx.owner);
    expect(position.lender).to.eq(OpenTx.loanOffering.owner);
    expect(position.owedToken).to.eq(OpenTx.owedToken);
    expect(position.heldToken).to.eq(OpenTx.heldToken);
    expect(position.interestRate).to.be.bignumber.eq(OpenTx.loanOffering.rates.interestRate);
    expect(position.callTimeLimit).to.be.bignumber.eq(OpenTx.loanOffering.callTimeLimit);
    expect(position.interestPeriod).to.be.bignumber.eq(OpenTx.loanOffering.rates.interestPeriod);
    expect(position.maxDuration).to.be.bignumber.eq(OpenTx.loanOffering.maxDuration);

    const [
      finalBalance,
      owedAmount,
      finalBalances
    ] = await Promise.all([
      dydxMargin.getPositionBalance.call(OpenTx.id),
      getOwedAmount(OpenTx, tx, addValueTx.principal, false),
      getBalances(addValueTx, owedToken, heldToken, feeToken)
    ]);

    const startingHeldTokenPerUnit = startingBalance.div(OpenTx.principal);
    const finalHeldTokenPerUnit = finalBalance
      .div(OpenTx.principal.plus(addValueTx.principal));

    const totalHeldTokenAdded = getPartialAmount(
      addValueTx.principal,
      OpenTx.principal,
      startingBalance,
      true // round up
    );

    const soldAmount = addValueTx.depositInHeldToken ?
      owedAmount
      : getPartialAmount(
        addValueTx.buyOrder.takerTokenAmount,
        addValueTx.buyOrder.makerTokenAmount,
        totalHeldTokenAdded,
        true
      );
    const heldTokenFromSell = getPartialAmount(
      addValueTx.buyOrder.makerTokenAmount,
      addValueTx.buyOrder.takerTokenAmount,
      soldAmount
    );

    const heldTokenDeposit = addValueTx.depositInHeldToken ?
      totalHeldTokenAdded.minus(heldTokenFromSell) : 0;
    const owedTokenDeposit = addValueTx.depositInHeldToken ?
      0 : soldAmount.minus(owedAmount);

    const leftoverOwedToken = addValueTx.depositInHeldToken ?
      0 : heldTokenFromSell.minus(totalHeldTokenAdded);

    // heldToken Per Unit
    expect(startingHeldTokenPerUnit).to.be.bignumber.eq(finalHeldTokenPerUnit);

    // Lender owedToken
    expect(finalBalances.lenderOwedToken).to.be.bignumber.eq(
      startingBalances.lenderOwedToken.minus(owedAmount)
    );

    // Maker owedToken
    expect(finalBalances.makerOwedToken).to.be.bignumber.eq(
      startingBalances.makerOwedToken.plus(soldAmount)
    );

    // Maker heldToken
    expect(finalBalances.makerHeldToken).to.be.bignumber.eq(
      startingBalances.makerHeldToken.minus(heldTokenFromSell)
    );

    // Trader heldToken
    expect(finalBalances.traderHeldToken).to.be.bignumber.eq(
      startingBalances.traderHeldToken.minus(heldTokenDeposit)
    );

    // Trader owedToken
    expect(finalBalances.traderOwedToken).to.be.bignumber.eq(
      startingBalances.traderOwedToken.minus(owedTokenDeposit)
    );

    // Exchange Wrapper owedToken
    expect(finalBalances.exchangeWrapperOwedToken).to.be.bignumber.eq(0);

    // Exchange Wrapper heldToken
    expect(finalBalances.exchangeWrapperHeldToken).to.be.bignumber.eq(leftoverOwedToken);
  }
});

describe('#increasePositionDirectly', () => {
  contract('Margin', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const [
        OpenTx,
        dydxMargin,
        heldToken,
        testPositionOwner,
        testLoanOwner
      ] = await Promise.all([
        createOpenTx(accounts),
        Margin.deployed(),
        HeldToken.deployed(),
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
      const heldTokenAmount = getPartialAmount(
        addAmount,
        OpenTx.principal,
        startingBalance,
        true
      );

      await heldToken.issueTo(
        adder,
        heldTokenAmount
      );
      await heldToken.approve(
        ProxyContract.address,
        heldTokenAmount,
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
      const startingHeldTokenPerUnit = startingBalance.div(OpenTx.principal);
      const finalHeldTokenPerUnit = finalBalance.div(OpenTx.principal.plus(addAmount));

      expect(finalHeldTokenPerUnit).to.be.bignumber.eq(startingHeldTokenPerUnit);

      const [
        adderHeldToken,
        afterIncreasePosition,
        adderLoanValueAdded
      ] = await Promise.all([
        heldToken.balanceOf.call(adder),
        testPositionOwner.valueAdded.call(OpenTx.id, adder),
        testLoanOwner.valueAdded.call(OpenTx.id, adder),
      ]);

      expect(adderHeldToken).to.be.bignumber.eq(0);
      expect(afterIncreasePosition).to.be.bignumber.eq(addAmount);
      expect(adderLoanValueAdded).to.be.bignumber.eq(addAmount);
    });
  });
});
