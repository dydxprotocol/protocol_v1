const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const { wait } = require('@digix/tempo')(web3);
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const ExchangeWrapper = artifacts.require("ZeroExV1ExchangeWrapper");
const Vault = artifacts.require("Vault");
const { ZeroExProxyV1 } = require('../../contracts/ZeroExV1');

const { ADDRESSES, DEFAULT_SALT } = require('../../helpers/Constants');
const { getOwedAmount } = require('../../helpers/ClosePositionHelper');
const { getPartialAmount } = require('../../helpers/MathHelper');
const { signLoanOffering } = require('../../helpers/LoanHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');
const { signOrder } = require('../../helpers/ZeroExV1Helper');
const { issueAndSetAllowance } = require('../../helpers/TokenHelper');
const {
  getPosition,
  callIncreasePosition,
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition,
  issueTokenToAccountInAmountAndApproveProxy,
} = require('../../helpers/MarginHelper');

let salt = DEFAULT_SALT + 1;

describe('#increasePosition', () => {
  contract('Margin', accounts => {
    it('succeeds on valid inputs', async () => {
      const {
        openTx,
        increasePosTx,
        dydxMargin,
        startingBalance,
        startingBalances
      } = await setup(accounts);

      const tx = await callIncreasePosition(dydxMargin, increasePosTx);

      console.log(
        '\tMargin.increasePosition (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed
      );

      await validate({
        dydxMargin,
        openTx,
        increasePosTx,
        tx,
        startingBalance,
        startingBalances
      });
    });
  });

  contract('Margin', accounts => {
    it('succeeds when depositing in owedToken', async () => {
      const {
        openTx,
        increasePosTx,
        dydxMargin,
        startingBalance,
        startingBalances
      } = await setup(accounts, { depositInHeldToken: false });

      const tx = await callIncreasePosition(dydxMargin, increasePosTx);

      await validate({
        dydxMargin,
        openTx,
        increasePosTx,
        tx,
        startingBalance,
        startingBalances
      });
    });
  });

  contract('Margin', accounts => {
    it('fails when loanOffering.minHeldToken is too high', async () => {
      const {
        openTx,
        increasePosTx,
        dydxMargin
      } = await setup(accounts);

      increasePosTx.loanOffering.rates.minHeldToken = openTx.loanOffering.rates.minHeldToken;
      increasePosTx.loanOffering.signature = await signLoanOffering(increasePosTx.loanOffering);
      await expectThrow(callIncreasePosition(dydxMargin, increasePosTx));
    });
  });

  contract('Margin', accounts => {
    it('succeeds when positions are owned by contracts', async () => {
      const [
        testPositionOwner,
        testLoanOwner
      ] = await Promise.all([
        TestPositionOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ONE, 0),
        TestLoanOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ONE),
      ]);

      const {
        openTx,
        increasePosTx,
        dydxMargin,
        startingBalance,
        startingBalances
      } = await setup(
        accounts,
        { positionOwner: testPositionOwner.address, loanOwner: testLoanOwner.address }
      );

      const tx = await callIncreasePosition(dydxMargin, increasePosTx);

      const [
        positionPrincipalAdded,
        loanValueAdded
      ] = await Promise.all([
        testPositionOwner.valueAdded.call(openTx.id, increasePosTx.trader),
        testLoanOwner.valueAdded.call(openTx.id, increasePosTx.loanOffering.payer),
      ]);

      expect(positionPrincipalAdded).to.be.bignumber.eq(increasePosTx.principal);
      expect(loanValueAdded).to.be.bignumber.eq(increasePosTx.principal);

      await validate({
        dydxMargin,
        openTx,
        increasePosTx,
        tx,
        startingBalance,
        startingBalances
      });
    });
  });


  contract('Margin', accounts => {
    it('succeeds through layers of contracts', async () => {
      const [
        testPositionOwner1,
        testPositionOwner2,
        testLoanOwner1,
        testLoanOwner2
      ] = await Promise.all([
        TestPositionOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ZERO, 0),
        TestPositionOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ZERO, 0),
        TestLoanOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ZERO),
        TestLoanOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ZERO),
      ]);

      const {
        openTx,
        increasePosTx,
        dydxMargin,
        startingBalance,
        startingBalances
      } = await setup(
        accounts,
        { positionOwner: testPositionOwner1.address, loanOwner: testLoanOwner1.address }
      );

      // fail once
      await expectThrow(
        callIncreasePosition(dydxMargin, increasePosTx)
      );

      // set permissions
      await Promise.all([
        testPositionOwner1.setToReturnOnAdd(testPositionOwner2.address),
        testPositionOwner2.setToReturnOnAdd(increasePosTx.trader),
        testLoanOwner1.setToReturnOnAdd(testLoanOwner2.address),
        testLoanOwner2.setToReturnOnAdd(increasePosTx.loanOffering.payer),
      ]);

      // succeed as it chains through
      const tx = await callIncreasePosition(dydxMargin, increasePosTx);

      const [
        positionPrincipalAdded1,
        positionPrincipalAdded2,
        loanValueAdded1,
        loanValueAdded2
      ] = await Promise.all([
        testPositionOwner1.valueAdded.call(openTx.id, increasePosTx.trader),
        testPositionOwner2.valueAdded.call(openTx.id, increasePosTx.trader),
        testLoanOwner1.valueAdded.call(openTx.id, increasePosTx.loanOffering.payer),
        testLoanOwner2.valueAdded.call(openTx.id, increasePosTx.loanOffering.payer),
      ]);

      expect(positionPrincipalAdded1).to.be.bignumber.eq(increasePosTx.principal);
      expect(positionPrincipalAdded2).to.be.bignumber.eq(increasePosTx.principal);
      expect(loanValueAdded1).to.be.bignumber.eq(increasePosTx.principal);
      expect(loanValueAdded2).to.be.bignumber.eq(increasePosTx.principal);

      await validate({
        dydxMargin,
        openTx,
        increasePosTx,
        tx,
        startingBalance,
        startingBalances
      });
    });
  });

  contract('Margin', accounts => {
    it('fails when loan owner smart contract does not consent', async () => {
      const [
        testPositionOwner,
        testLoanOwner
      ] = await Promise.all([
        TestPositionOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ONE, 0),
        TestLoanOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ZERO),
      ]);

      const {
        increasePosTx,
        dydxMargin,
      } = await setup(
        accounts,
        { positionOwner: testPositionOwner.address, loanOwner: testLoanOwner.address }
      );
      await expectThrow(callIncreasePosition(dydxMargin, increasePosTx));
    });
  });

  contract('Margin', accounts => {
    it('fails when position owner smart contract does not consent', async () => {
      const [
        testPositionOwner,
        testLoanOwner
      ] = await Promise.all([
        TestPositionOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ZERO, 0),
        TestLoanOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ONE),
      ]);

      const {
        increasePosTx,
        dydxMargin,
      } = await setup(
        accounts,
        { positionOwner: testPositionOwner.address, loanOwner: testLoanOwner.address }
      );
      await expectThrow(callIncreasePosition(dydxMargin, increasePosTx));
    });
  });

  contract('Margin', accounts => {
    it('allows a loan offering with longer maxDuration to be used', async () => {
      const {
        openTx,
        increasePosTx,
        dydxMargin,
        startingBalance,
        startingBalances
      } = await setup(accounts);

      increasePosTx.loanOffering.maxDuration = increasePosTx.loanOffering.maxDuration * 2;
      increasePosTx.loanOffering.signature = await signLoanOffering(increasePosTx.loanOffering);

      const tx = await callIncreasePosition(dydxMargin, increasePosTx);

      await validate({
        dydxMargin,
        openTx,
        increasePosTx,
        tx,
        startingBalance,
        startingBalances
      });
    });
  });

  contract('Margin', accounts => {
    it('does not allow a loan offering with smaller maxDuration to be used', async () => {
      const {
        increasePosTx,
        dydxMargin,
      } = await setup(accounts);

      increasePosTx.loanOffering.maxDuration = increasePosTx.loanOffering.maxDuration / 10;
      increasePosTx.loanOffering.signature = await signLoanOffering(increasePosTx.loanOffering);

      await expectThrow(callIncreasePosition(dydxMargin, increasePosTx));
    });
  });

  contract('Margin', accounts => {
    it('allows a loan offering with longer callTimeLimit to be used', async () => {
      const {
        openTx,
        increasePosTx,
        dydxMargin,
        startingBalance,
        startingBalances
      } = await setup(accounts);

      increasePosTx.loanOffering.callTimeLimit = increasePosTx.loanOffering.callTimeLimit * 2;
      increasePosTx.loanOffering.signature = await signLoanOffering(increasePosTx.loanOffering);

      const tx = await callIncreasePosition(dydxMargin, increasePosTx);

      await validate({
        dydxMargin,
        openTx,
        increasePosTx,
        tx,
        startingBalance,
        startingBalances
      });
    });
  });

  contract('Margin', accounts => {
    it('does not allow a loan offering with smaller callTimeLimit to be used', async () => {
      const {
        increasePosTx,
        dydxMargin,
      } = await setup(accounts);

      increasePosTx.loanOffering.callTimeLimit = increasePosTx.loanOffering.callTimeLimit - 1;
      increasePosTx.loanOffering.signature = await signLoanOffering(increasePosTx.loanOffering);

      await expectThrow(callIncreasePosition(dydxMargin, increasePosTx));
    });
  });

  contract('Margin', accounts => {
    it('does not allow a loan offering with smaller callTimeLimit to be used', async () => {
      const {
        increasePosTx,
        dydxMargin,
      } = await setup(accounts);

      increasePosTx.loanOffering.callTimeLimit = increasePosTx.loanOffering.callTimeLimit - 1;
      increasePosTx.loanOffering.signature = await signLoanOffering(increasePosTx.loanOffering);

      await expectThrow(callIncreasePosition(dydxMargin, increasePosTx));
    });
  });

  contract('Margin', accounts => {
    it('does not allow additions after maximum duration', async () => {
      const {
        openTx,
        increasePosTx,
        dydxMargin,
      } = await setup(accounts);

      await wait(openTx.loanOffering.maxDuration + 1);

      await expectThrow(callIncreasePosition(dydxMargin, increasePosTx));
    });
  });

  contract('Margin', accounts => {
    it('does not allow buy orders with too high price', async () => {
      const {
        increasePosTx,
        dydxMargin,
        heldToken
      } = await setup(accounts);

      increasePosTx.buyOrder.makerTokenAmount = increasePosTx.buyOrder.makerTokenAmount.times(1000);
      increasePosTx.buyOrder.ecSignature = await signOrder(increasePosTx.buyOrder);

      await issueAndSetAllowance(
        heldToken,
        increasePosTx.buyOrder.maker,
        increasePosTx.buyOrder.makerTokenAmount,
        ZeroExProxyV1.address
      );

      await expectThrow(callIncreasePosition(dydxMargin, increasePosTx));
    });
  });

  contract('Margin', accounts => {
    it('disallows buy orders with too high price when depositing in owed token', async () => {
      const {
        increasePosTx,
        dydxMargin,
        heldToken
      } = await setup(accounts, { depositInHeldToken: false });

      increasePosTx.buyOrder.makerTokenAmount = increasePosTx.buyOrder.makerTokenAmount.times(1000);
      increasePosTx.buyOrder.ecSignature = await signOrder(increasePosTx.buyOrder);

      await issueAndSetAllowance(
        heldToken,
        increasePosTx.buyOrder.maker,
        increasePosTx.buyOrder.makerTokenAmount,
        ZeroExProxyV1.address
      );

      await expectThrow(callIncreasePosition(dydxMargin, increasePosTx));
    });
  });

  contract('Margin', accounts => {
    it('Does not allow more owedToken to be borrowed from the lender than maxAmount', async () => {
      const {
        increasePosTx,
        dydxMargin,
        heldToken
      } = await setup(accounts);

      await issueAndSetAllowance(
        heldToken,
        increasePosTx.buyOrder.maker,
        increasePosTx.buyOrder.makerTokenAmount,
        ZeroExProxyV1.address
      );

      increasePosTx.loanOffering.rates.maxAmount = new BigNumber(increasePosTx.principal);
      increasePosTx.loanOffering.rates.lenderFee = new BigNumber(0);
      increasePosTx.loanOffering.rates.takerFee = new BigNumber(0);
      increasePosTx.loanOffering.rates.minAmount = new BigNumber(1);
      increasePosTx.loanOffering.rates.minHeldToken = new BigNumber(1);
      increasePosTx.loanOffering.signature = await signLoanOffering(increasePosTx.loanOffering);

      await expectThrow(callIncreasePosition(dydxMargin, increasePosTx));
    });
  });
});

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
    openTx,
    increasePosTx
  ] = await Promise.all([
    createOpenTx(accounts),
    createOpenTx(accounts, { salt: ++salt, depositInHeldToken })
  ]);

  if (loanOwner) {
    openTx.loanOffering.owner = loanOwner;
    openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
    increasePosTx.loanOffering.owner = loanOwner;
  }
  if (positionOwner) {
    openTx.owner = positionOwner;
    increasePosTx.owner = positionOwner;
  }

  // Lower minHeldToken since more owedTokens are given than the increasePosTx.principal
  increasePosTx.loanOffering.rates.minHeldToken =
    increasePosTx.loanOffering.rates.minHeldToken.div(2).floor();
  increasePosTx.loanOffering.signature = await signLoanOffering(increasePosTx.loanOffering);

  await issueTokensAndSetAllowances(openTx);

  const response = await callOpenPosition(dydxMargin, openTx);

  if (depositInHeldToken) {
    await issueTokenToAccountInAmountAndApproveProxy(
      heldToken,
      increasePosTx.trader,
      increasePosTx.depositAmount
    );
  } else {
    await issueTokenToAccountInAmountAndApproveProxy(
      owedToken,
      increasePosTx.trader,
      increasePosTx.depositAmount
    );
  }

  openTx.id = response.id;
  openTx.response = response;

  const [
    startingBalance,
    startingBalances,
  ] = await Promise.all([
    dydxMargin.getPositionBalance.call(openTx.id),
    getBalances(increasePosTx, owedToken, heldToken, feeToken, dydxMargin),
  ]);

  increasePosTx.principal = increasePosTx.principal.div(4).floor();
  increasePosTx.id = openTx.id;

  // Wait until the next interest period
  await wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber());

  return {
    openTx,
    increasePosTx,
    dydxMargin,
    owedToken,
    heldToken,
    feeToken,
    startingBalance,
    startingBalances
  };
}

async function getBalances(tx, owedToken, heldToken, feeToken, dydxMargin) {
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
    traderFeeToken,
    loanOfferingFilledAmount
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
    dydxMargin.getLoanFilledAmount.call(tx.loanOffering.loanHash)
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
    traderFeeToken,
    loanOfferingFilledAmount
  }
}

async function validate({
  dydxMargin,
  openTx,
  increasePosTx,
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
    getPosition(dydxMargin, openTx.id),
    OwedToken.deployed(),
    HeldToken.deployed(),
    FeeToken.deployed(),
  ]);

  expect(position.principal).to.be.bignumber.eq(
    openTx.principal.plus(increasePosTx.principal)
  );

  expect(position.owner).to.eq(openTx.owner);
  expect(position.lender).to.eq(openTx.loanOffering.owner);
  expect(position.owedToken).to.eq(openTx.owedToken);
  expect(position.heldToken).to.eq(openTx.heldToken);
  expect(position.interestRate).to.be.bignumber.eq(openTx.loanOffering.rates.interestRate);
  expect(position.callTimeLimit).to.be.bignumber.eq(openTx.loanOffering.callTimeLimit);
  expect(position.interestPeriod).to.be.bignumber.eq(openTx.loanOffering.rates.interestPeriod);
  expect(position.maxDuration).to.be.bignumber.eq(openTx.loanOffering.maxDuration);

  const [
    finalBalance,
    owedAmount,
    finalBalances
  ] = await Promise.all([
    dydxMargin.getPositionBalance.call(openTx.id),
    getOwedAmount(openTx, tx, increasePosTx.principal, false),
    getBalances(increasePosTx, owedToken, heldToken, feeToken, dydxMargin)
  ]);

  const startingHeldTokenBalancePerUnit = getPartialAmount(startingBalance, openTx.principal);
  const finalHeldTokenPerUnit =
    getPartialAmount(finalBalance, (openTx.principal.plus(increasePosTx.principal)));

  const totalHeldTokenAdded = getPartialAmount(
    increasePosTx.principal,
    openTx.principal,
    startingBalance,
    true // round up
  );

  const soldAmount = increasePosTx.depositInHeldToken ?
    owedAmount
    : getPartialAmount(
      increasePosTx.buyOrder.takerTokenAmount,
      increasePosTx.buyOrder.makerTokenAmount,
      totalHeldTokenAdded,
      true
    );
  const heldTokenFromSell = getPartialAmount(
    increasePosTx.buyOrder.makerTokenAmount,
    increasePosTx.buyOrder.takerTokenAmount,
    soldAmount
  );

  const heldTokenDeposit = increasePosTx.depositInHeldToken ?
    totalHeldTokenAdded.minus(heldTokenFromSell) : 0;
  const owedTokenDeposit = increasePosTx.depositInHeldToken ?
    0 : soldAmount.minus(owedAmount);

  const leftoverOwedToken = increasePosTx.depositInHeldToken ?
    0 : heldTokenFromSell.minus(totalHeldTokenAdded);

  // heldToken Per Unit
  expect(startingHeldTokenBalancePerUnit).to.be.bignumber.eq(finalHeldTokenPerUnit);

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

  // Loan Offering Filled Amount
  expect(finalBalances.loanOfferingFilledAmount).to.be.bignumber.eq(
    startingBalances.loanOfferingFilledAmount.plus(owedAmount)
  );
}
