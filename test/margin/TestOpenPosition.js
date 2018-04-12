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
const TestLoanOwner = artifacts.require("TestLoanOwner");
const TestClosePositionDelegator = artifacts.require("TestClosePositionDelegator");
const TestPositionOwner = artifacts.require("TestPositionOwner");
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
      const OpenPositionTx = await createMarginTradeTx(accounts);
      const margin = await Margin.deployed();

      await issueTokensAndSetAllowancesFor(OpenPositionTx);

      const tx = await callOpenPosition(margin, OpenPositionTx);

      console.log('\tMargin.openPosition (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(margin, OpenPositionTx);
    });
  });

  contract('Margin', function(accounts) {
    it('allows smart contracts to be lenders', async () => {
      const OpenPositionTx = await createMarginTradeTx(accounts);
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

      await issueTokensAndSetAllowancesFor(OpenPositionTx);

      const [
        lenderFeeTokenBalance,
        lenderBaseTokenBalance
      ] = await Promise.all([
        feeToken.balanceOf.call(OpenPositionTx.loanOffering.payer),
        baseToken.balanceOf.call(OpenPositionTx.loanOffering.payer)
      ]);
      await Promise.all([
        feeToken.transfer(
          testSmartContractLender.address,
          lenderFeeTokenBalance,
          { from: OpenPositionTx.loanOffering.payer }
        ),
        baseToken.transfer(
          testSmartContractLender.address,
          lenderBaseTokenBalance,
          { from: OpenPositionTx.loanOffering.payer }
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

      OpenPositionTx.loanOffering.signer = OpenPositionTx.loanOffering.payer;
      OpenPositionTx.loanOffering.payer = testSmartContractLender.address;
      OpenPositionTx.loanOffering.owner = testMarginCallDelegator.address;
      OpenPositionTx.loanOffering.signature = await signLoanOffering(OpenPositionTx.loanOffering);

      const tx = await callOpenPosition(margin, OpenPositionTx);

      console.log('\tMargin.openPosition (smart contract lender) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(margin, OpenPositionTx);
    });
  });

  contract('Margin', function(accounts) {
    it('doesnt allow ownership to be assigned to contracts without proper interface', async () => {
      const margin = await Margin.deployed();
      const testLoanOwner = await TestLoanOwner.new(Margin.address, ADDRESSES.ZERO, false);
      const testPositionOwner = await TestPositionOwner.new(Margin.address, ADDRESSES.ZERO, false);

      const OpenPositionTx1 = await createMarginTradeTx(accounts);
      await issueTokensAndSetAllowancesFor(OpenPositionTx1);
      OpenPositionTx1.owner = testLoanOwner.address; // can't take position ownership
      OpenPositionTx1.loanOffering.signature = await signLoanOffering(OpenPositionTx1.loanOffering);
      await expectThrow( callOpenPosition(margin, OpenPositionTx1));

      const OpenPositionTx2 = await createMarginTradeTx(accounts);
      await issueTokensAndSetAllowancesFor(OpenPositionTx2);
      OpenPositionTx2.loanOffering.owner = testPositionOwner.address; // cant take lender ownership
      OpenPositionTx2.loanOffering.signature = await signLoanOffering(OpenPositionTx2.loanOffering);
      await expectThrow( callOpenPosition(margin, OpenPositionTx2));
    });
  });

  contract('Margin', function(accounts) {
    it('properly assigns owner for lender and trader for accounts', async () => {
      const margin = await Margin.deployed();
      const OpenPositionTx = await createMarginTradeTx(accounts);
      await issueTokensAndSetAllowancesFor(OpenPositionTx);
      OpenPositionTx.owner = accounts[8];
      OpenPositionTx.loanOffering.owner = accounts[9];
      OpenPositionTx.loanOffering.signature = await signLoanOffering(OpenPositionTx.loanOffering);
      await callOpenPosition(margin, OpenPositionTx);
      await checkSuccess(margin, OpenPositionTx);
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
      const OpenPositionTx = await createMarginTradeTx(accounts);
      await issueTokensAndSetAllowancesFor(OpenPositionTx);
      OpenPositionTx.owner = testClosePositionDelegator.address;
      OpenPositionTx.loanOffering.owner = testMarginCallDelegator.address;
      OpenPositionTx.loanOffering.signature = await signLoanOffering(OpenPositionTx.loanOffering);
      await callOpenPosition(margin, OpenPositionTx);
      await checkSuccess(margin, OpenPositionTx);
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
      const testLoanOwner = await TestLoanOwner.new(
        Margin.address,
        testMarginCallDelegator.address,
        false);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        testClosePositionDelegator.address,
        false);
      const OpenPositionTx = await createMarginTradeTx(accounts);
      await issueTokensAndSetAllowancesFor(OpenPositionTx);
      OpenPositionTx.owner = testPositionOwner.address;
      OpenPositionTx.loanOffering.owner = testLoanOwner.address;
      OpenPositionTx.loanOffering.signature = await signLoanOffering(OpenPositionTx.loanOffering);
      await callOpenPosition(margin, OpenPositionTx);
      await checkSuccess(margin, OpenPositionTx);
    });
  });

  contract('Margin', function(accounts) {
    it('succeeds with on-chain approved loan offerings', async () => {
      const OpenPositionTx = await createMarginTradeTx(accounts);
      const margin = await Margin.deployed();

      await issueTokensAndSetAllowancesFor(OpenPositionTx);
      await callApproveLoanOffering(margin, OpenPositionTx.loanOffering);

      OpenPositionTx.loanOffering.signature.v = 0;
      OpenPositionTx.loanOffering.signature.r = "";
      OpenPositionTx.loanOffering.signature.s = "";

      await callOpenPosition(margin, OpenPositionTx);

      await checkSuccess(margin, OpenPositionTx);
    });
  });
});

async function checkSuccess(margin, OpenPositionTx) {
  const marginId = web3Instance.utils.soliditySha3(
    OpenPositionTx.loanOffering.loanHash,
    0
  );

  const contains = await margin.containsPosition.call(marginId);
  expect(contains).to.equal(true);
  const position = await getPosition(margin, marginId);

  expect(position.baseToken).to.equal(OpenPositionTx.baseToken);
  expect(position.quoteToken).to.equal(OpenPositionTx.quoteToken);
  expect(position.marginAmount).to.be.bignumber.equal(OpenPositionTx.marginAmount);
  expect(position.interestRate).to.be.bignumber.equal(
    OpenPositionTx.loanOffering.rates.interestRate);
  expect(position.callTimeLimit).to.be.bignumber.equal(OpenPositionTx.loanOffering.callTimeLimit);
  expect(position.closedAmount).to.be.bignumber.equal(0);
  expect(position.callTimestamp).to.be.bignumber.equal(0);
  expect(position.maxDuration).to.be.bignumber.equal(OpenPositionTx.loanOffering.maxDuration);

  // if atomic owner is specified, then expect it
  if (OpenPositionTx.owner === ADDRESSES.ZERO) {
    expect(position.trader).to.equal(OpenPositionTx.trader);
  } else {
    let toReturn = null;
    try {
      toReturn = await TestPositionOwner.at(OpenPositionTx.owner).TO_RETURN.call();
    } catch(e) {
      toReturn = null;
    }
    expect(position.trader).to.equal(toReturn ? toReturn : OpenPositionTx.owner);
  }

  // if atomic owner is specified, then expect it
  if (OpenPositionTx.loanOffering.owner === ADDRESSES.ZERO) {
    expect(position.lender).to.equal(OpenPositionTx.loanOffering.payer);
  } else {
    let toReturn = null;
    try {
      toReturn = await TestLoanOwner.at(OpenPositionTx.loanOffering.owner).TO_RETURN.call();
    } catch(e) {
      toReturn = null;
    }
    expect(position.lender).to.equal(toReturn ? toReturn : OpenPositionTx.loanOffering.owner);
  }

  const balance = await margin.getPositionBalance.call(marginId);

  const quoteTokenFromSell = getPartialAmount(
    OpenPositionTx.buyOrder.makerTokenAmount,
    OpenPositionTx.buyOrder.takerTokenAmount,
    OpenPositionTx.marginAmount
  );

  expect(balance).to.be.bignumber.equal(quoteTokenFromSell.plus(OpenPositionTx.depositAmount));

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
    baseToken.balanceOf.call(OpenPositionTx.loanOffering.payer),
    baseToken.balanceOf.call(OpenPositionTx.buyOrder.maker),
    baseToken.balanceOf.call(ExchangeWrapper.address),
    quoteToken.balanceOf.call(OpenPositionTx.trader),
    quoteToken.balanceOf.call(OpenPositionTx.buyOrder.maker),
    quoteToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(OpenPositionTx.loanOffering.payer),
    feeToken.balanceOf.call(OpenPositionTx.buyOrder.maker),
    feeToken.balanceOf.call(ExchangeWrapper.address),
    feeToken.balanceOf.call(OpenPositionTx.trader),
  ]);

  expect(lenderBaseToken).to.be.bignumber.equal(
    OpenPositionTx.loanOffering.rates.maxAmount.minus(OpenPositionTx.marginAmount)
  );
  expect(makerBaseToken).to.be.bignumber.equal(OpenPositionTx.marginAmount);
  expect(exchangeWrapperBaseToken).to.be.bignumber.equal(0);
  expect(traderQuoteToken).to.be.bignumber.equal(0);
  expect(makerQuoteToken).to.be.bignumber.equal(
    OpenPositionTx.buyOrder.makerTokenAmount.minus(quoteTokenFromSell)
  );
  expect(vaultQuoteToken).to.be.bignumber.equal(quoteTokenFromSell.plus(OpenPositionTx.depositAmount));
  expect(lenderFeeToken).to.be.bignumber.equal(
    OpenPositionTx.loanOffering.rates.lenderFee
      .minus(
        getPartialAmount(
          OpenPositionTx.marginAmount,
          OpenPositionTx.loanOffering.rates.maxAmount,
          OpenPositionTx.loanOffering.rates.lenderFee
        )
      )
  );
  expect(exchangeWrapperFeeToken).to.be.bignumber.equal(0);
  expect(makerFeeToken).to.be.bignumber.equal(
    OpenPositionTx.buyOrder.makerFee
      .minus(
        getPartialAmount(
          OpenPositionTx.marginAmount,
          OpenPositionTx.buyOrder.takerTokenAmount,
          OpenPositionTx.buyOrder.makerFee
        )
      )
  );
  expect(traderFeeToken).to.be.bignumber.equal(
    OpenPositionTx.loanOffering.rates.takerFee
      .plus(OpenPositionTx.buyOrder.takerFee)
      .minus(
        getPartialAmount(
          OpenPositionTx.marginAmount,
          OpenPositionTx.loanOffering.rates.maxAmount,
          OpenPositionTx.loanOffering.rates.takerFee
        )
      )
      .minus(
        getPartialAmount(
          OpenPositionTx.marginAmount,
          OpenPositionTx.buyOrder.takerTokenAmount,
          OpenPositionTx.buyOrder.takerFee
        )
      )
  );
}
