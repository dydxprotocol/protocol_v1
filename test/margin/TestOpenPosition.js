/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const Web3 = require('web3');

const Margin = artifacts.require("Margin");
const QuoteToken = artifacts.require("TokenA");
const BaseToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const Vault = artifacts.require("Vault");
const ProxyContract = artifacts.require("Proxy");
const TestSmartContractLender = artifacts.require("TestSmartContractLender");
const TestMarginCallDelegator = artifacts.require("TestMarginCallDelegator");
const TestLenderOwner = artifacts.require("TestLenderOwner");
const TestClosePositionDelegator = artifacts.require("TestClosePositionDelegator");
const TestTraderOwner = artifacts.require("TestTraderOwner");
const { ADDRESSES } = require('../helpers/Constants');
const { expectThrow } = require('../helpers/ExpectHelper');
const ExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const web3Instance = new Web3(web3.currentProvider);

const {
  createMarginTradeTx,
  issueTokensAndSetAllowancesFor,
  callOpenPosition,
  getPosition,
  callApproveLoanOffering
} = require('../helpers/MarginHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');

describe('#openPosition', () => {
  contract('Margin', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const openTx = await createMarginTradeTx(accounts);
      const margin = await Margin.deployed();

      await issueTokensAndSetAllowancesFor(openTx);

      const tx = await callOpenPosition(margin, openTx);

      console.log('\tMargin.openPosition (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(margin, openTx);
    });
  });

  contract('Margin', function(accounts) {
    it('allows smart contracts to be lenders', async () => {
      const openTx = await createMarginTradeTx(accounts);
      const [
        margin,
        feeToken,
        baseToken,
        testSmartContractLender
      ] = await Promise.all([
        Margin.deployed(),
        FeeToken.deployed(),
        BaseToken.deployed(),
        TestSmartContractLender.new(true)
      ]);

      await issueTokensAndSetAllowancesFor(openTx);

      const [
        lenderFeeTokenBalance,
        lenderBaseTokenBalance
      ] = await Promise.all([
        feeToken.balanceOf.call(openTx.loanOffering.payer),
        baseToken.balanceOf.call(openTx.loanOffering.payer)
      ]);
      await Promise.all([
        feeToken.transfer(
          testSmartContractLender.address,
          lenderFeeTokenBalance,
          { from: openTx.loanOffering.payer }
        ),
        baseToken.transfer(
          testSmartContractLender.address,
          lenderBaseTokenBalance,
          { from: openTx.loanOffering.payer }
        )
      ]);
      await Promise.all([
        testSmartContractLender.allow(
          feeToken.address,
          ProxyContract.address,
          lenderFeeTokenBalance
        ),
        testSmartContractLender.allow(
          baseToken.address,
          ProxyContract.address,
          lenderBaseTokenBalance
        )
      ]);
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);

      openTx.loanOffering.signer = openTx.loanOffering.payer;
      openTx.loanOffering.payer = testSmartContractLender.address;
      openTx.loanOffering.owner = testMarginCallDelegator.address;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

      const tx = await callOpenPosition(margin, openTx);

      console.log('\tMargin.openPosition (smart contract lender) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(margin, openTx);
    });
  });

  contract('Margin', function(accounts) {
    it('doesnt allow ownership to be assigned to contracts without proper interface', async () => {
      const margin = await Margin.deployed();
      const testLenderOwner = await TestLenderOwner.new(Margin.address, ADDRESSES.ZERO, false);
      const testTraderOwner = await TestTraderOwner.new(Margin.address, ADDRESSES.ZERO, false);

      const openTx1 = await createMarginTradeTx(accounts);
      await issueTokensAndSetAllowancesFor(openTx1);
      openTx1.owner = testLenderOwner.address; // can't take position ownership
      openTx1.loanOffering.signature = await signLoanOffering(openTx1.loanOffering);
      await expectThrow( callOpenPosition(margin, openTx1));

      const openTx2 = await createMarginTradeTx(accounts);
      await issueTokensAndSetAllowancesFor(openTx2);
      openTx2.loanOffering.owner = testTraderOwner.address; // cant take lender ownership
      openTx2.loanOffering.signature = await signLoanOffering(openTx2.loanOffering);
      await expectThrow( callOpenPosition(margin, openTx2));
    });
  });

  contract('Margin', function(accounts) {
    it('properly assigns owner for lender and trader for accounts', async () => {
      const margin = await Margin.deployed();
      const openTx = await createMarginTradeTx(accounts);
      await issueTokensAndSetAllowancesFor(openTx);
      openTx.owner = accounts[8];
      openTx.loanOffering.owner = accounts[9];
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
      await callOpenPosition(margin, openTx);
      await checkSuccess(margin, openTx);
    });
  });

  contract('Margin', function(accounts) {
    it('properly assigns owner for lender and trader for contracts', async () => {
      const margin = await Margin.deployed();
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        false);
      const openTx = await createMarginTradeTx(accounts);
      await issueTokensAndSetAllowancesFor(openTx);
      openTx.owner = testClosePositionDelegator.address;
      openTx.loanOffering.owner = testMarginCallDelegator.address;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
      await callOpenPosition(margin, openTx);
      await checkSuccess(margin, openTx);
    });
  });

  contract('Margin', function(accounts) {
    it('properly assigns owner for lender and trader for chaining', async () => {
      const margin = await Margin.deployed();
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        false);
      const testLenderOwner = await TestLenderOwner.new(
        Margin.address,
        testMarginCallDelegator.address,
        false);
      const testTraderOwner = await TestTraderOwner.new(
        Margin.address,
        testClosePositionDelegator.address,
        false);
      const openTx = await createMarginTradeTx(accounts);
      await issueTokensAndSetAllowancesFor(openTx);
      openTx.owner = testTraderOwner.address;
      openTx.loanOffering.owner = testLenderOwner.address;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
      await callOpenPosition(margin, openTx);
      await checkSuccess(margin, openTx);
    });
  });

  contract('Margin', function(accounts) {
    it('succeeds with on-chain approved loan offerings', async () => {
      const openTx = await createMarginTradeTx(accounts);
      const margin = await Margin.deployed();

      await issueTokensAndSetAllowancesFor(openTx);
      await callApproveLoanOffering(margin, openTx.loanOffering);

      openTx.loanOffering.signature.v = 0;
      openTx.loanOffering.signature.r = "";
      openTx.loanOffering.signature.s = "";

      await callOpenPosition(margin, openTx);

      await checkSuccess(margin, openTx);
    });
  });
});

async function checkSuccess(margin, openTx) {
  const marginId = web3Instance.utils.soliditySha3(
    openTx.loanOffering.loanHash,
    0
  );

  const contains = await margin.containsPosition.call(marginId);
  expect(contains).to.equal(true);
  const position = await getPosition(margin, marginId);

  expect(position.baseToken).to.equal(openTx.baseToken);
  expect(position.quoteToken).to.equal(openTx.quoteToken);
  expect(position.amount).to.be.bignumber.equal(openTx.amount);
  expect(position.interestRate).to.be.bignumber.equal(
    openTx.loanOffering.rates.interestRate);
  expect(position.callTimeLimit).to.be.bignumber.equal(openTx.loanOffering.callTimeLimit);
  expect(position.closedAmount).to.be.bignumber.equal(0);
  expect(position.callTimestamp).to.be.bignumber.equal(0);
  expect(position.maxDuration).to.be.bignumber.equal(openTx.loanOffering.maxDuration);

  // if atomic owner is specified, then expect it
  if (openTx.owner === ADDRESSES.ZERO) {
    expect(position.trader).to.equal(openTx.trader);
  } else {
    let toReturn = null;
    try {
      toReturn = await TestTraderOwner.at(openTx.owner).TO_RETURN.call();
    } catch(e) {
      toReturn = null;
    }
    expect(position.trader).to.equal(toReturn ? toReturn : openTx.owner);
  }

  // if atomic owner is specified, then expect it
  if (openTx.loanOffering.owner === ADDRESSES.ZERO) {
    expect(position.lender).to.equal(openTx.loanOffering.payer);
  } else {
    let toReturn = null;
    try {
      toReturn = await TestLenderOwner.at(openTx.loanOffering.owner).TO_RETURN.call();
    } catch(e) {
      toReturn = null;
    }
    expect(position.lender).to.equal(toReturn ? toReturn : openTx.loanOffering.owner);
  }

  const balance = await margin.getPositionBalance.call(marginId);

  const quoteTokenFromSell = getPartialAmount(
    openTx.buyOrder.makerTokenAmount,
    openTx.buyOrder.takerTokenAmount,
    openTx.amount
  );

  expect(balance).to.be.bignumber.equal(quoteTokenFromSell.plus(openTx.depositAmount));

  const [
    baseToken,
    quoteToken,
    feeToken
  ] = await Promise.all([
    BaseToken.deployed(),
    QuoteToken.deployed(),
    FeeToken.deployed()
  ]);

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
    baseToken.balanceOf.call(openTx.loanOffering.payer),
    baseToken.balanceOf.call(openTx.buyOrder.maker),
    baseToken.balanceOf.call(ExchangeWrapper.address),
    quoteToken.balanceOf.call(openTx.trader),
    quoteToken.balanceOf.call(openTx.buyOrder.maker),
    quoteToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(openTx.loanOffering.payer),
    feeToken.balanceOf.call(openTx.buyOrder.maker),
    feeToken.balanceOf.call(ExchangeWrapper.address),
    feeToken.balanceOf.call(openTx.trader),
  ]);

  expect(lenderBaseToken).to.be.bignumber.equal(
    openTx.loanOffering.rates.maxAmount.minus(openTx.amount)
  );
  expect(makerBaseToken).to.be.bignumber.equal(openTx.amount);
  expect(exchangeWrapperBaseToken).to.be.bignumber.equal(0);
  expect(traderQuoteToken).to.be.bignumber.equal(0);
  expect(makerQuoteToken).to.be.bignumber.equal(
    openTx.buyOrder.makerTokenAmount.minus(quoteTokenFromSell)
  );
  expect(vaultQuoteToken).to.be.bignumber.equal(quoteTokenFromSell.plus(openTx.depositAmount));
  expect(lenderFeeToken).to.be.bignumber.equal(
    openTx.loanOffering.rates.lenderFee
      .minus(
        getPartialAmount(
          openTx.amount,
          openTx.loanOffering.rates.maxAmount,
          openTx.loanOffering.rates.lenderFee
        )
      )
  );
  expect(exchangeWrapperFeeToken).to.be.bignumber.equal(0);
  expect(makerFeeToken).to.be.bignumber.equal(
    openTx.buyOrder.makerFee
      .minus(
        getPartialAmount(
          openTx.amount,
          openTx.buyOrder.takerTokenAmount,
          openTx.buyOrder.makerFee
        )
      )
  );
  expect(traderFeeToken).to.be.bignumber.equal(
    openTx.loanOffering.rates.takerFee
      .plus(openTx.buyOrder.takerFee)
      .minus(
        getPartialAmount(
          openTx.amount,
          openTx.loanOffering.rates.maxAmount,
          openTx.loanOffering.rates.takerFee
        )
      )
      .minus(
        getPartialAmount(
          openTx.amount,
          openTx.buyOrder.takerTokenAmount,
          openTx.buyOrder.takerFee
        )
      )
  );
}
