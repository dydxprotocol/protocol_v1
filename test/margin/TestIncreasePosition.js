/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const { wait } = require('@digix/tempo')(web3);
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const { ADDRESSES, DEFAULT_SALT } = require('../helpers/Constants');
const ExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const Vault = artifacts.require("Vault");
const { getOwedAmount } = require('../helpers/ClosePositionHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { signOrder } = require('../helpers/ZeroExHelper');
const { issueAndSetAllowance } = require('../helpers/TokenHelper');

const {
  getPosition,
  callIncreasePosition,
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition,
  issueTokenToAccountInAmountAndApproveProxy,
} = require('../helpers/MarginHelper');

let salt = DEFAULT_SALT + 1;

describe('#increasePosition', () => {
  contract('Margin', accounts => {
    it('succeeds on valid inputs', async () => {
      const {
        OpenTx,
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
        OpenTx,
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
        OpenTx,
        increasePosTx,
        dydxMargin,
        startingBalance,
        startingBalances
      } = await setup(accounts, { depositInHeldToken: false });

      const tx = await callIncreasePosition(dydxMargin, increasePosTx);

      await validate({
        dydxMargin,
        OpenTx,
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
        OpenTx,
        increasePosTx,
        dydxMargin
      } = await setup(accounts);

      increasePosTx.loanOffering.rates.minHeldToken = OpenTx.loanOffering.rates.minHeldToken;
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
        TestPositionOwner.new(Margin.address, ADDRESSES.ONE, true, 0),
        TestLoanOwner.new(Margin.address, ADDRESSES.ONE, true),
      ]);

      const {
        OpenTx,
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
        testPositionOwner.valueAdded.call(OpenTx.id, increasePosTx.trader),
        testLoanOwner.valueAdded.call(OpenTx.id, increasePosTx.loanOffering.payer),
      ]);

      expect(positionPrincipalAdded).to.be.bignumber.eq(increasePosTx.principal);
      expect(loanValueAdded).to.be.bignumber.eq(increasePosTx.principal);

      await validate({
        dydxMargin,
        OpenTx,
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
        TestPositionOwner.new(Margin.address, ADDRESSES.ONE, true, 0),
        TestLoanOwner.new(Margin.address, ADDRESSES.ONE, false),
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
        TestPositionOwner.new(Margin.address, ADDRESSES.ONE, false, 0),
        TestLoanOwner.new(Margin.address, ADDRESSES.ONE, true),
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
        OpenTx,
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
        OpenTx,
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
        OpenTx,
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
        OpenTx,
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
        OpenTx,
        increasePosTx,
        dydxMargin,
      } = await setup(accounts);

      await wait(OpenTx.loanOffering.maxDuration + 1);

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
        ZeroExProxy.address
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
        ZeroExProxy.address
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
        ZeroExProxy.address
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
    OpenTx,
    increasePosTx
  ] = await Promise.all([
    createOpenTx(accounts),
    createOpenTx(accounts, { salt: ++salt, depositInHeldToken })
  ]);

  if (loanOwner) {
    OpenTx.loanOffering.owner = loanOwner;
    OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);
    increasePosTx.loanOffering.owner = loanOwner;
  }
  if (positionOwner) {
    OpenTx.owner = positionOwner;
    increasePosTx.owner = positionOwner;
  }

  // Lower minHeldToken since more owedTokens are given than the increasePosTx.principal
  increasePosTx.loanOffering.rates.minHeldToken =
    increasePosTx.loanOffering.rates.minHeldToken.div(2).floor();
  increasePosTx.loanOffering.signature = await signLoanOffering(increasePosTx.loanOffering);

  await issueTokensAndSetAllowances(OpenTx);

  const response = await callOpenPosition(dydxMargin, OpenTx);

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

  OpenTx.id = response.id;
  OpenTx.response = response;

  const [
    startingBalance,
    startingBalances,
  ] = await Promise.all([
    dydxMargin.getPositionBalance.call(OpenTx.id),
    getBalances(increasePosTx, owedToken, heldToken, feeToken, dydxMargin),
  ]);

  increasePosTx.principal = increasePosTx.principal.div(4).floor();
  increasePosTx.id = OpenTx.id;

  // Wait until the next interest period
  await wait(OpenTx.loanOffering.rates.interestPeriod.plus(1).toNumber());

  return {
    OpenTx,
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
  OpenTx,
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
    getPosition(dydxMargin, OpenTx.id),
    OwedToken.deployed(),
    HeldToken.deployed(),
    FeeToken.deployed(),
  ]);

  expect(position.principal).to.be.bignumber.eq(
    OpenTx.principal.plus(increasePosTx.principal)
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
    getOwedAmount(OpenTx, tx, increasePosTx.principal, false),
    getBalances(increasePosTx, owedToken, heldToken, feeToken, dydxMargin)
  ]);

  const startingHeldTokenBalancePerUnit = getPartialAmount(startingBalance, OpenTx.principal);
  const finalHeldTokenPerUnit =
    getPartialAmount(finalBalance, (OpenTx.principal.plus(increasePosTx.principal)));

  const totalHeldTokenAdded = getPartialAmount(
    increasePosTx.principal,
    OpenTx.principal,
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
