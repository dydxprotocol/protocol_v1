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
const TestCloseShortDelegator = artifacts.require("TestCloseShortDelegator");
const TestShortOwner = artifacts.require("TestShortOwner");
const { ADDRESSES } = require('../helpers/Constants');
const { expectThrow } = require('../helpers/ExpectHelper');
const ExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const web3Instance = new Web3(web3.currentProvider);

const {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  getShort,
  callApproveLoanOffering
} = require('../helpers/ShortSellHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');

describe('#short', () => {
  contract('Margin', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const shortTx = await createShortSellTx(accounts);
      const shortSell = await Margin.deployed();

      await issueTokensAndSetAllowancesForShort(shortTx);

      const tx = await callShort(shortSell, shortTx);

      console.log('\tMargin.short (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('Margin', function(accounts) {
    it('allows smart contracts to be lenders', async () => {
      const shortTx = await createShortSellTx(accounts);
      const [
        shortSell,
        feeToken,
        baseToken,
        testSmartContractLender
      ] = await Promise.all([
        Margin.deployed(),
        FeeToken.deployed(),
        BaseToken.deployed(),
        TestSmartContractLender.new(true)
      ]);

      await issueTokensAndSetAllowancesForShort(shortTx);

      const [
        lenderFeeTokenBalance,
        lenderBaseTokenBalance
      ] = await Promise.all([
        feeToken.balanceOf.call(shortTx.loanOffering.payer),
        baseToken.balanceOf.call(shortTx.loanOffering.payer)
      ]);
      await Promise.all([
        feeToken.transfer(
          testSmartContractLender.address,
          lenderFeeTokenBalance,
          { from: shortTx.loanOffering.payer }
        ),
        baseToken.transfer(
          testSmartContractLender.address,
          lenderBaseTokenBalance,
          { from: shortTx.loanOffering.payer }
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

      shortTx.loanOffering.signer = shortTx.loanOffering.payer;
      shortTx.loanOffering.payer = testSmartContractLender.address;
      shortTx.loanOffering.owner = testCallLoanDelegator.address;
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

      const tx = await callShort(shortSell, shortTx);

      console.log('\tMargin.short (smart contract lender) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('Margin', function(accounts) {
    it('doesnt allow ownership to be assigned to contracts without proper interface', async () => {
      const shortSell = await Margin.deployed();
      const testLoanOwner = await TestLoanOwner.new(Margin.address, ADDRESSES.ZERO, false);
      const testShortOwner = await TestShortOwner.new(Margin.address, ADDRESSES.ZERO, false);

      const shortTx1 = await createShortSellTx(accounts);
      await issueTokensAndSetAllowancesForShort(shortTx1);
      shortTx1.owner = testLoanOwner.address; // loan owner can't take short
      shortTx1.loanOffering.signature = await signLoanOffering(shortTx1.loanOffering);
      await expectThrow( callShort(shortSell, shortTx1));

      const shortTx2 = await createShortSellTx(accounts);
      await issueTokensAndSetAllowancesForShort(shortTx2);
      shortTx2.loanOffering.owner = testShortOwner.address; // short owner can't take loan
      shortTx2.loanOffering.signature = await signLoanOffering(shortTx2.loanOffering);
      await expectThrow( callShort(shortSell, shortTx2));
    });
  });

  contract('Margin', function(accounts) {
    it('properly assigns owner for lender and seller for accounts', async () => {
      const shortSell = await Margin.deployed();
      const shortTx = await createShortSellTx(accounts);
      await issueTokensAndSetAllowancesForShort(shortTx);
      shortTx.owner = accounts[8];
      shortTx.loanOffering.owner = accounts[9];
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);
      await callShort(shortSell, shortTx);
      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('Margin', function(accounts) {
    it('properly assigns owner for lender and seller for contracts', async () => {
      const shortSell = await Margin.deployed();
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testCloseShortDelegator = await TestCloseShortDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        false);
      const shortTx = await createShortSellTx(accounts);
      await issueTokensAndSetAllowancesForShort(shortTx);
      shortTx.owner = testCloseShortDelegator.address;
      shortTx.loanOffering.owner = testCallLoanDelegator.address;
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);
      await callShort(shortSell, shortTx);
      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('Margin', function(accounts) {
    it('properly assigns owner for lender and seller for chaining', async () => {
      const shortSell = await Margin.deployed();
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testCloseShortDelegator = await TestCloseShortDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        false);
      const testLoanOwner = await TestLoanOwner.new(
        Margin.address,
        testCallLoanDelegator.address,
        false);
      const testShortOwner = await TestShortOwner.new(
        Margin.address,
        testCloseShortDelegator.address,
        false);
      const shortTx = await createShortSellTx(accounts);
      await issueTokensAndSetAllowancesForShort(shortTx);
      shortTx.owner = testShortOwner.address;
      shortTx.loanOffering.owner = testLoanOwner.address;
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);
      await callShort(shortSell, shortTx);
      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('Margin', function(accounts) {
    it('succeeds with on-chain approved loan offerings', async () => {
      const shortTx = await createShortSellTx(accounts);
      const shortSell = await Margin.deployed();

      await issueTokensAndSetAllowancesForShort(shortTx);
      await callApproveLoanOffering(shortSell, shortTx.loanOffering);

      shortTx.loanOffering.signature.v = 0;
      shortTx.loanOffering.signature.r = "";
      shortTx.loanOffering.signature.s = "";

      await callShort(shortSell, shortTx);

      await checkSuccess(shortSell, shortTx);
    });
  });
});

async function checkSuccess(shortSell, shortTx) {
  const shortId = web3Instance.utils.soliditySha3(
    shortTx.loanOffering.loanHash,
    0
  );

  const contains = await shortSell.containsShort.call(shortId);
  expect(contains).to.equal(true);
  const short = await getShort(shortSell, shortId);

  expect(short.baseToken).to.equal(shortTx.baseToken);
  expect(short.quoteToken).to.equal(shortTx.quoteToken);
  expect(short.shortAmount).to.be.bignumber.equal(shortTx.shortAmount);
  expect(short.interestRate).to.be.bignumber.equal(
    shortTx.loanOffering.rates.interestRate);
  expect(short.callTimeLimit).to.be.bignumber.equal(shortTx.loanOffering.callTimeLimit);
  expect(short.closedAmount).to.be.bignumber.equal(0);
  expect(short.callTimestamp).to.be.bignumber.equal(0);
  expect(short.maxDuration).to.be.bignumber.equal(shortTx.loanOffering.maxDuration);

  // if atomic owner is specified, then expect it
  if (shortTx.owner === ADDRESSES.ZERO) {
    expect(short.seller).to.equal(shortTx.seller);
  } else {
    let toReturn = null;
    try {
      toReturn = await TestShortOwner.at(shortTx.owner).TO_RETURN.call();
    } catch(e) {
      toReturn = null;
    }
    expect(short.seller).to.equal(toReturn ? toReturn : shortTx.owner);
  }

  // if atomic owner is specified, then expect it
  if (shortTx.loanOffering.owner === ADDRESSES.ZERO) {
    expect(short.lender).to.equal(shortTx.loanOffering.payer);
  } else {
    let toReturn = null;
    try {
      toReturn = await TestLoanOwner.at(shortTx.loanOffering.owner).TO_RETURN.call();
    } catch(e) {
      toReturn = null;
    }
    expect(short.lender).to.equal(toReturn ? toReturn : shortTx.loanOffering.owner);
  }

  const balance = await shortSell.getShortBalance.call(shortId);

  const quoteTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    shortTx.shortAmount
  );

  expect(balance).to.be.bignumber.equal(quoteTokenFromSell.plus(shortTx.depositAmount));

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
    sellerQuoteToken,
    makerQuoteToken,
    vaultQuoteToken,
    lenderFeeToken,
    makerFeeToken,
    exchangeWrapperFeeToken,
    sellerFeeToken
  ] = await Promise.all([
    baseToken.balanceOf.call(shortTx.loanOffering.payer),
    baseToken.balanceOf.call(shortTx.buyOrder.maker),
    baseToken.balanceOf.call(ExchangeWrapper.address),
    quoteToken.balanceOf.call(shortTx.seller),
    quoteToken.balanceOf.call(shortTx.buyOrder.maker),
    quoteToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(shortTx.loanOffering.payer),
    feeToken.balanceOf.call(shortTx.buyOrder.maker),
    feeToken.balanceOf.call(ExchangeWrapper.address),
    feeToken.balanceOf.call(shortTx.seller),
  ]);

  expect(lenderBaseToken).to.be.bignumber.equal(
    shortTx.loanOffering.rates.maxAmount.minus(shortTx.shortAmount)
  );
  expect(makerBaseToken).to.be.bignumber.equal(shortTx.shortAmount);
  expect(exchangeWrapperBaseToken).to.be.bignumber.equal(0);
  expect(sellerQuoteToken).to.be.bignumber.equal(0);
  expect(makerQuoteToken).to.be.bignumber.equal(
    shortTx.buyOrder.makerTokenAmount.minus(quoteTokenFromSell)
  );
  expect(vaultQuoteToken).to.be.bignumber.equal(quoteTokenFromSell.plus(shortTx.depositAmount));
  expect(lenderFeeToken).to.be.bignumber.equal(
    shortTx.loanOffering.rates.lenderFee
      .minus(
        getPartialAmount(
          shortTx.shortAmount,
          shortTx.loanOffering.rates.maxAmount,
          shortTx.loanOffering.rates.lenderFee
        )
      )
  );
  expect(exchangeWrapperFeeToken).to.be.bignumber.equal(0);
  expect(makerFeeToken).to.be.bignumber.equal(
    shortTx.buyOrder.makerFee
      .minus(
        getPartialAmount(
          shortTx.shortAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.buyOrder.makerFee
        )
      )
  );
  expect(sellerFeeToken).to.be.bignumber.equal(
    shortTx.loanOffering.rates.takerFee
      .plus(shortTx.buyOrder.takerFee)
      .minus(
        getPartialAmount(
          shortTx.shortAmount,
          shortTx.loanOffering.rates.maxAmount,
          shortTx.loanOffering.rates.takerFee
        )
      )
      .minus(
        getPartialAmount(
          shortTx.shortAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.buyOrder.takerFee
        )
      )
  );
}
