/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const Web3 = require('web3');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
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
  contract('ShortSell', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const shortTx = await createShortSellTx(accounts);
      const shortSell = await ShortSell.deployed();

      await issueTokensAndSetAllowancesForShort(shortTx);

      const tx = await callShort(shortSell, shortTx);

      console.log('\tShortSell.short (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('ShortSell', function(accounts) {
    it('allows smart contracts to be lenders', async () => {
      const shortTx = await createShortSellTx(accounts);
      const [
        shortSell,
        feeToken,
        underlyingToken,
        testSmartContractLender
      ] = await Promise.all([
        ShortSell.deployed(),
        FeeToken.deployed(),
        UnderlyingToken.deployed(),
        TestSmartContractLender.new(true)
      ]);

      await issueTokensAndSetAllowancesForShort(shortTx);

      const [
        lenderFeeTokenBalance,
        lenderUnderlyingTokenBalance
      ] = await Promise.all([
        feeToken.balanceOf.call(shortTx.loanOffering.lender),
        underlyingToken.balanceOf.call(shortTx.loanOffering.lender)
      ]);
      await Promise.all([
        feeToken.transfer(
          testSmartContractLender.address,
          lenderFeeTokenBalance,
          { from: shortTx.loanOffering.lender }
        ),
        underlyingToken.transfer(
          testSmartContractLender.address,
          lenderUnderlyingTokenBalance,
          { from: shortTx.loanOffering.lender }
        )
      ]);
      await Promise.all([
        testSmartContractLender.allow(
          feeToken.address,
          ProxyContract.address,
          lenderFeeTokenBalance
        ),
        testSmartContractLender.allow(
          underlyingToken.address,
          ProxyContract.address,
          lenderUnderlyingTokenBalance
        )
      ]);
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        ShortSell.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);

      shortTx.loanOffering.signer = shortTx.loanOffering.lender;
      shortTx.loanOffering.lender = testSmartContractLender.address;
      shortTx.loanOffering.owner = testCallLoanDelegator.address;
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

      const tx = await callShort(shortSell, shortTx);

      console.log('\tShortSell.short (smart contract lender) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('ShortSell', function(accounts) {
    it('doesnt allow ownership to be assigned to contracts without proper interface', async () => {
      const shortSell = await ShortSell.deployed();
      const testLoanOwner = await TestLoanOwner.new(ShortSell.address, ADDRESSES.ZERO);
      const testShortOwner = await TestShortOwner.new(ShortSell.address, ADDRESSES.ZERO);

      const shortTx1 = await createShortSellTx(accounts);
      await issueTokensAndSetAllowancesForShort(shortTx1);
      shortTx1.owner = testLoanOwner.address; // loan owner can't take short
      shortTx1.loanOffering.signature = await signLoanOffering(shortTx1.loanOffering);
      await expectThrow(() => callShort(shortSell, shortTx1));

      const shortTx2 = await createShortSellTx(accounts);
      await issueTokensAndSetAllowancesForShort(shortTx2);
      shortTx2.loanOffering.owner = testShortOwner.address; // short owner can't take loan
      shortTx2.loanOffering.signature = await signLoanOffering(shortTx2.loanOffering);
      await expectThrow(() => callShort(shortSell, shortTx2));
    });
  });

  contract('ShortSell', function(accounts) {
    it('properly assigns owner for lender and seller for accounts', async () => {
      const shortSell = await ShortSell.deployed();
      const shortTx = await createShortSellTx(accounts);
      await issueTokensAndSetAllowancesForShort(shortTx);
      shortTx.owner = accounts[8];
      shortTx.loanOffering.owner = accounts[9];
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);
      await callShort(shortSell, shortTx);
      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('ShortSell', function(accounts) {
    it('properly assigns owner for lender and seller for contracts', async () => {
      const shortSell = await ShortSell.deployed();
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        ShortSell.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testCloseShortDelegator = await TestCloseShortDelegator.new(
        ShortSell.address,
        ADDRESSES.ZERO);
      const shortTx = await createShortSellTx(accounts);
      await issueTokensAndSetAllowancesForShort(shortTx);
      shortTx.owner = testCloseShortDelegator.address;
      shortTx.loanOffering.owner = testCallLoanDelegator.address;
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);
      await callShort(shortSell, shortTx);
      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('ShortSell', function(accounts) {
    it('properly assigns owner for lender and seller for chaining', async () => {
      const shortSell = await ShortSell.deployed();
      const testCallLoanDelegator = await TestCallLoanDelegator.new(
        ShortSell.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);
      const testCloseShortDelegator = await TestCloseShortDelegator.new(
        ShortSell.address,
        ADDRESSES.ZERO);
      const testLoanOwner = await TestLoanOwner.new(
        ShortSell.address,
        testCallLoanDelegator.address);
      const testShortOwner = await TestShortOwner.new(
        ShortSell.address,
        testCloseShortDelegator.address);
      const shortTx = await createShortSellTx(accounts);
      await issueTokensAndSetAllowancesForShort(shortTx);
      shortTx.owner = testShortOwner.address;
      shortTx.loanOffering.owner = testLoanOwner.address;
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);
      await callShort(shortSell, shortTx);
      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('ShortSell', function(accounts) {
    it('succeeds with on-chain approved loan offerings', async () => {
      const shortTx = await createShortSellTx(accounts);
      const shortSell = await ShortSell.deployed();

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

  expect(short.underlyingToken).to.equal(shortTx.underlyingToken);
  expect(short.baseToken).to.equal(shortTx.baseToken);
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
    expect(short.lender).to.equal(shortTx.loanOffering.lender);
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

  const baseTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    shortTx.shortAmount
  );

  expect(balance).to.be.bignumber.equal(baseTokenFromSell.plus(shortTx.depositAmount));

  const [
    underlyingToken,
    baseToken,
    feeToken
  ] = await Promise.all([
    UnderlyingToken.deployed(),
    BaseToken.deployed(),
    FeeToken.deployed()
  ]);

  const [
    lenderUnderlyingToken,
    makerUnderlyingToken,
    vaultUnderlyingToken,
    sellerBaseToken,
    makerBaseToken,
    vaultBaseToken,
    lenderFeeToken,
    makerFeeToken,
    vaultFeeToken,
    sellerFeeToken
  ] = await Promise.all([
    underlyingToken.balanceOf.call(shortTx.loanOffering.lender),
    underlyingToken.balanceOf.call(shortTx.buyOrder.maker),
    underlyingToken.balanceOf.call(Vault.address),
    baseToken.balanceOf.call(shortTx.seller),
    baseToken.balanceOf.call(shortTx.buyOrder.maker),
    baseToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(shortTx.loanOffering.lender),
    feeToken.balanceOf.call(shortTx.buyOrder.maker),
    feeToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(shortTx.seller),
    feeToken.balanceOf.call(shortTx.buyOrder.feeRecipient),
    feeToken.balanceOf.call(shortTx.loanOffering.feeRecipient),
  ]);

  expect(lenderUnderlyingToken).to.be.bignumber.equal(
    shortTx.loanOffering.rates.maxAmount.minus(shortTx.shortAmount)
  );
  expect(makerUnderlyingToken).to.be.bignumber.equal(shortTx.shortAmount);
  expect(vaultUnderlyingToken).to.be.bignumber.equal(0);
  expect(sellerBaseToken).to.be.bignumber.equal(0);
  expect(makerBaseToken).to.be.bignumber.equal(
    shortTx.buyOrder.makerTokenAmount.minus(baseTokenFromSell)
  );
  expect(vaultBaseToken).to.be.bignumber.equal(baseTokenFromSell.plus(shortTx.depositAmount));
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
  expect(vaultFeeToken).to.be.bignumber.equal(0);
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
