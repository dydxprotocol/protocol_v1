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
const TestCallLoanDelegator = artifacts.require("TestCallLoanDelegator");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const TestClosePositionDelegator = artifacts.require("TestClosePositionDelegator");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const { ADDRESSES } = require('../helpers/Constants');
const { expectThrow } = require('../helpers/ExpectHelper');
const ExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const web3Instance = new Web3(web3.currentProvider);

const {
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition,
  getPosition,
  callApproveLoanOffering
} = require('../helpers/MarginHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');

describe('#openPosition', () => {
  contract('Margin', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const OpenTx = await createOpenTx(accounts);
      const dydxMargin = await Margin.deployed();

      await issueTokensAndSetAllowances(OpenTx);

      const tx = await callOpenPosition(dydxMargin, OpenTx);

      console.log('\tMargin.openPosition (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', function(accounts) {
    it('allows smart contracts to be lenders', async () => {
      const OpenTx = await createOpenTx(accounts);
      const [
        dydxMargin,
        feeToken,
        baseToken,
        testSmartContractLender
      ] = await Promise.all([
        Margin.deployed(),
        FeeToken.deployed(),
        BaseToken.deployed(),
        TestSmartContractLender.new(true)
      ]);

      await issueTokensAndSetAllowances(OpenTx);

      const [
        lenderFeeTokenBalance,
        lenderBaseTokenBalance
      ] = await Promise.all([
        feeToken.balanceOf.call(OpenTx.loanOffering.payer),
        baseToken.balanceOf.call(OpenTx.loanOffering.payer)
      ]);
      await Promise.all([
        feeToken.transfer(
          testSmartContractLender.address,
          lenderFeeTokenBalance,
          { from: OpenTx.loanOffering.payer }
        ),
        baseToken.transfer(
          testSmartContractLender.address,
          lenderBaseTokenBalance,
          { from: OpenTx.loanOffering.payer }
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
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);

      OpenTx.loanOffering.signer = OpenTx.loanOffering.payer;
      OpenTx.loanOffering.payer = testSmartContractLender.address;
      OpenTx.loanOffering.owner = testCallLoanDelegator.address;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

      const tx = await callOpenPosition(dydxMargin, OpenTx);

      console.log('\tMargin.openPosition (smart contract lender) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', function(accounts) {
    it('doesnt allow ownership to be assigned to contracts without proper interface', async () => {
      const dydxMargin = await Margin.deployed();
      const testLoanOwner = await TestLoanOwner.new(Margin.address, ADDRESSES.ZERO, false);
      const testPositionOwner = await TestPositionOwner.new(Margin.address, ADDRESSES.ZERO, false);

      const OpenTx1 = await createOpenTx(accounts);
      await issueTokensAndSetAllowances(OpenTx1);
      OpenTx1.owner = testLoanOwner.address; // loan owner can't take ownership
      OpenTx1.loanOffering.signature = await signLoanOffering(OpenTx1.loanOffering);
      await expectThrow( callOpenPosition(dydxMargin, OpenTx1));

      const OpenTx2 = await createOpenTx(accounts);
      await issueTokensAndSetAllowances(OpenTx2);
      OpenTx2.loanOffering.owner = testPositionOwner.address; // owner can't take loan
      OpenTx2.loanOffering.signature = await signLoanOffering(OpenTx2.loanOffering);
      await expectThrow( callOpenPosition(dydxMargin, OpenTx2));
    });
  });

  contract('Margin', function(accounts) {
    it('properly assigns owner for lender and owner for accounts', async () => {
      const dydxMargin = await Margin.deployed();
      const OpenTx = await createOpenTx(accounts);
      await issueTokensAndSetAllowances(OpenTx);
      OpenTx.owner = accounts[8];
      OpenTx.loanOffering.owner = accounts[9];
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);
      await callOpenPosition(dydxMargin, OpenTx);
      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', function(accounts) {
    it('properly assigns owner for lender and owner for contracts', async () => {
      const dydxMargin = await Margin.deployed();
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        false);
      const OpenTx = await createOpenTx(accounts);
      await issueTokensAndSetAllowances(OpenTx);
      OpenTx.owner = testClosePositionDelegator.address;
      OpenTx.loanOffering.owner = testCallLoanDelegator.address;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);
      await callOpenPosition(dydxMargin, OpenTx);
      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', function(accounts) {
    it('properly assigns owner for lender and owner for chaining', async () => {
      const dydxMargin = await Margin.deployed();
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testClosePositionDelegator = await TestClosePositionDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        false);
      const testLoanOwner = await TestLoanOwner.new(
        Margin.address,
        testCallLoanDelegator.address,
        false);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        testClosePositionDelegator.address,
        false);
      const OpenTx = await createOpenTx(accounts);
      await issueTokensAndSetAllowances(OpenTx);
      OpenTx.owner = testPositionOwner.address;
      OpenTx.loanOffering.owner = testLoanOwner.address;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);
      await callOpenPosition(dydxMargin, OpenTx);
      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', function(accounts) {
    it('succeeds with on-chain approved loan offerings', async () => {
      const OpenTx = await createOpenTx(accounts);
      const dydxMargin = await Margin.deployed();

      await issueTokensAndSetAllowances(OpenTx);
      await callApproveLoanOffering(dydxMargin, OpenTx.loanOffering);

      OpenTx.loanOffering.signature.v = 0;
      OpenTx.loanOffering.signature.r = "";
      OpenTx.loanOffering.signature.s = "";

      await callOpenPosition(dydxMargin, OpenTx);

      await checkSuccess(dydxMargin, OpenTx);
    });
  });
});

async function checkSuccess(dydxMargin, OpenTx) {
  const positionId = web3Instance.utils.soliditySha3(
    OpenTx.loanOffering.loanHash,
    0
  );

  const contains = await dydxMargin.containsPosition.call(positionId);
  expect(contains).to.equal(true);
  const position = await getPosition(dydxMargin, positionId);

  expect(position.baseToken).to.equal(OpenTx.baseToken);
  expect(position.quoteToken).to.equal(OpenTx.quoteToken);
  expect(position.principal).to.be.bignumber.equal(OpenTx.principal);
  expect(position.interestRate).to.be.bignumber.equal(
    OpenTx.loanOffering.rates.interestRate);
  expect(position.callTimeLimit).to.be.bignumber.equal(OpenTx.loanOffering.callTimeLimit);
  expect(position.callTimestamp).to.be.bignumber.equal(0);
  expect(position.maxDuration).to.be.bignumber.equal(OpenTx.loanOffering.maxDuration);

  // if atomic owner is specified, then expect it
  if (OpenTx.owner === ADDRESSES.ZERO) {
    expect(position.owner).to.equal(OpenTx.trader);
  } else {
    let toReturn = null;
    try {
      toReturn = await TestPositionOwner.at(OpenTx.owner).TO_RETURN.call();
    } catch(e) {
      toReturn = null;
    }
    expect(position.owner).to.equal(toReturn ? toReturn : OpenTx.owner);
  }

  // if atomic owner is specified, then expect it
  if (OpenTx.loanOffering.owner === ADDRESSES.ZERO) {
    expect(position.lender).to.equal(OpenTx.loanOffering.payer);
  } else {
    let toReturn = null;
    try {
      toReturn = await TestLoanOwner.at(OpenTx.loanOffering.owner).TO_RETURN.call();
    } catch(e) {
      toReturn = null;
    }
    expect(position.lender).to.equal(toReturn ? toReturn : OpenTx.loanOffering.owner);
  }

  const balance = await dydxMargin.getPositionBalance.call(positionId);

  const quoteTokenFromSell = getPartialAmount(
    OpenTx.buyOrder.makerTokenAmount,
    OpenTx.buyOrder.takerTokenAmount,
    OpenTx.principal
  );

  expect(balance).to.be.bignumber.equal(quoteTokenFromSell.plus(OpenTx.depositAmount));

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
    baseToken.balanceOf.call(OpenTx.loanOffering.payer),
    baseToken.balanceOf.call(OpenTx.buyOrder.maker),
    baseToken.balanceOf.call(ExchangeWrapper.address),
    quoteToken.balanceOf.call(OpenTx.trader),
    quoteToken.balanceOf.call(OpenTx.buyOrder.maker),
    quoteToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(OpenTx.loanOffering.payer),
    feeToken.balanceOf.call(OpenTx.buyOrder.maker),
    feeToken.balanceOf.call(ExchangeWrapper.address),
    feeToken.balanceOf.call(OpenTx.trader),
  ]);

  expect(lenderBaseToken).to.be.bignumber.equal(
    OpenTx.loanOffering.rates.maxAmount.minus(OpenTx.principal)
  );
  expect(makerBaseToken).to.be.bignumber.equal(OpenTx.principal);
  expect(exchangeWrapperBaseToken).to.be.bignumber.equal(0);
  expect(traderQuoteToken).to.be.bignumber.equal(0);
  expect(makerQuoteToken).to.be.bignumber.equal(
    OpenTx.buyOrder.makerTokenAmount.minus(quoteTokenFromSell)
  );
  expect(vaultQuoteToken).to.be.bignumber.equal(quoteTokenFromSell.plus(OpenTx.depositAmount));
  expect(lenderFeeToken).to.be.bignumber.equal(
    OpenTx.loanOffering.rates.lenderFee
      .minus(
        getPartialAmount(
          OpenTx.principal,
          OpenTx.loanOffering.rates.maxAmount,
          OpenTx.loanOffering.rates.lenderFee
        )
      )
  );
  expect(exchangeWrapperFeeToken).to.be.bignumber.equal(0);
  expect(makerFeeToken).to.be.bignumber.equal(
    OpenTx.buyOrder.makerFee
      .minus(
        getPartialAmount(
          OpenTx.principal,
          OpenTx.buyOrder.takerTokenAmount,
          OpenTx.buyOrder.makerFee
        )
      )
  );
  expect(traderFeeToken).to.be.bignumber.equal(
    OpenTx.loanOffering.rates.takerFee
      .plus(OpenTx.buyOrder.takerFee)
      .minus(
        getPartialAmount(
          OpenTx.principal,
          OpenTx.loanOffering.rates.maxAmount,
          OpenTx.loanOffering.rates.takerFee
        )
      )
      .minus(
        getPartialAmount(
          OpenTx.principal,
          OpenTx.buyOrder.takerTokenAmount,
          OpenTx.buyOrder.takerFee
        )
      )
  );
}
