/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const Web3 = require('web3');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const Vault = artifacts.require("Vault");
const ProxyContract = artifacts.require("Proxy");
const TestSmartContractLender = artifacts.require("TestSmartContractLender");
const TestMarginCallDelegator = artifacts.require("TestMarginCallDelegator");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const TestClosePositionDelegator = artifacts.require("TestClosePositionDelegator");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const { ADDRESSES, BIGNUMBERS } = require('../helpers/Constants');
const { expectThrow } = require('../helpers/ExpectHelper');
const ExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const web3Instance = new Web3(web3.currentProvider);

const {
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition,
  getPosition,
  callApproveLoanOffering,
  getTokenAmountsFromOpen
} = require('../helpers/MarginHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');

describe('#openPosition', () => {
  contract('Margin', accounts => {
    it('succeeds on valid inputs', async () => {
      const OpenTx = await createOpenTx(accounts);
      const dydxMargin = await Margin.deployed();

      await issueTokensAndSetAllowances(OpenTx);

      const tx = await callOpenPosition(dydxMargin, OpenTx);

      console.log('\tMargin.openPosition (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', accounts => {
    it('succeeds when deposit is paid in owedToken', async () => {
      const OpenTx = await createOpenTx(accounts, { depositInHeldToken: false });
      const dydxMargin = await Margin.deployed();

      await issueTokensAndSetAllowances(OpenTx);

      const tx = await callOpenPosition(dydxMargin, OpenTx);

      console.log(
        '\tMargin.openPosition (owedToken deposit / 0x Exchange Contract) gas used: '
        + tx.receipt.gasUsed
      );

      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', accounts => {
    it('allows smart contracts to be lenders', async () => {
      const OpenTx = await createOpenTx(accounts);
      const [
        dydxMargin,
        feeToken,
        owedToken,
        testSmartContractLender
      ] = await Promise.all([
        Margin.deployed(),
        FeeToken.deployed(),
        OwedToken.deployed(),
        TestSmartContractLender.new(true, ADDRESSES.ZERO)
      ]);

      await issueTokensAndSetAllowances(OpenTx);

      const [
        lenderFeeTokenBalance,
        lenderOwedTokenBalance
      ] = await Promise.all([
        feeToken.balanceOf.call(OpenTx.loanOffering.payer),
        owedToken.balanceOf.call(OpenTx.loanOffering.payer)
      ]);
      await Promise.all([
        feeToken.transfer(
          testSmartContractLender.address,
          lenderFeeTokenBalance,
          { from: OpenTx.loanOffering.payer }
        ),
        owedToken.transfer(
          testSmartContractLender.address,
          lenderOwedTokenBalance,
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
          owedToken.address,
          ProxyContract.address,
          lenderOwedTokenBalance
        )
      ]);
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);

      OpenTx.loanOffering.signer = OpenTx.loanOffering.payer;
      OpenTx.loanOffering.payer = testSmartContractLender.address;
      OpenTx.loanOffering.owner = testMarginCallDelegator.address;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

      const tx = await callOpenPosition(dydxMargin, OpenTx);

      console.log('\tMargin.openPosition (smart contract lender) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', accounts => {
    it('allows smart contracts to specify other addresses', async () => {
      const OpenTx = await createOpenTx(accounts);
      const testSmartContractLender2 = await TestSmartContractLender.new(true, ADDRESSES.ZERO);
      const [
        dydxMargin,
        feeToken,
        owedToken,
        testSmartContractLender
      ] = await Promise.all([
        Margin.deployed(),
        FeeToken.deployed(),
        OwedToken.deployed(),
        TestSmartContractLender.new(true, testSmartContractLender2.address)
      ]);

      await issueTokensAndSetAllowances(OpenTx);

      const [
        lenderFeeTokenBalance,
        lenderOwedTokenBalance
      ] = await Promise.all([
        feeToken.balanceOf.call(OpenTx.loanOffering.payer),
        owedToken.balanceOf.call(OpenTx.loanOffering.payer)
      ]);
      await Promise.all([
        feeToken.transfer(
          testSmartContractLender.address,
          lenderFeeTokenBalance,
          { from: OpenTx.loanOffering.payer }
        ),
        owedToken.transfer(
          testSmartContractLender.address,
          lenderOwedTokenBalance,
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
          owedToken.address,
          ProxyContract.address,
          lenderOwedTokenBalance
        )
      ]);
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
        Margin.address,
        ADDRESSES.ZERO,
        ADDRESSES.ZERO);

      OpenTx.loanOffering.signer = OpenTx.loanOffering.payer;
      OpenTx.loanOffering.payer = testSmartContractLender.address;
      OpenTx.loanOffering.owner = testMarginCallDelegator.address;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

      const tx = await callOpenPosition(dydxMargin, OpenTx);

      console.log('\tMargin.openPosition (smart contract lender) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', accounts => {
    it('doesnt allow ownership to be assigned to contracts without proper interface', async () => {
      const dydxMargin = await Margin.deployed();
      const testLoanOwner = await TestLoanOwner.new(Margin.address, ADDRESSES.ZERO, false);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        ADDRESSES.ZERO,
        false,
        0
      );

      const OpenTx1 = await createOpenTx(accounts);
      await issueTokensAndSetAllowances(OpenTx1);
      OpenTx1.owner = testLoanOwner.address; // loan owner can't take ownership
      OpenTx1.loanOffering.signature = await signLoanOffering(OpenTx1.loanOffering);
      await expectThrow(callOpenPosition(dydxMargin, OpenTx1));

      const OpenTx2 = await createOpenTx(accounts);
      await issueTokensAndSetAllowances(OpenTx2);
      OpenTx2.loanOffering.owner = testPositionOwner.address; // owner can't take loan
      OpenTx2.loanOffering.signature = await signLoanOffering(OpenTx2.loanOffering);
      await expectThrow(callOpenPosition(dydxMargin, OpenTx2));
    });
  });

  contract('Margin', accounts => {
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

  contract('Margin', accounts => {
    it('properly assigns owner for lender and owner for contracts', async () => {
      const dydxMargin = await Margin.deployed();
      const testMarginCallDelegator = await TestMarginCallDelegator.new(
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
      OpenTx.loanOffering.owner = testMarginCallDelegator.address;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);
      await callOpenPosition(dydxMargin, OpenTx);
      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', accounts => {
    it('properly assigns owner for lender and owner for chaining', async () => {
      const dydxMargin = await Margin.deployed();
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
        false,
        0);
      const OpenTx = await createOpenTx(accounts);
      await issueTokensAndSetAllowances(OpenTx);
      OpenTx.owner = testPositionOwner.address;
      OpenTx.loanOffering.owner = testLoanOwner.address;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);
      await callOpenPosition(dydxMargin, OpenTx);
      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', accounts => {
    it('succeeds with on-chain approved loan offerings', async () => {
      const OpenTx = await createOpenTx(accounts);
      const dydxMargin = await Margin.deployed();

      await issueTokensAndSetAllowances(OpenTx);
      await callApproveLoanOffering(dydxMargin, OpenTx.loanOffering, OpenTx.loanOffering.signer);

      OpenTx.loanOffering.signature.v = 0;
      OpenTx.loanOffering.signature.r = "";
      OpenTx.loanOffering.signature.s = "";

      await callOpenPosition(dydxMargin, OpenTx);

      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', accounts => {
    it('does not transfer fees if fee address is 0', async () => {
      const OpenTx = await createOpenTx(accounts);
      const dydxMargin = await Margin.deployed();

      OpenTx.loanOffering.feeRecipient = ADDRESSES.ZERO;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

      await issueTokensAndSetAllowances(OpenTx);

      await callOpenPosition(dydxMargin, OpenTx);

      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', accounts => {
    it('fails if owedToken equals heldToken', async () => {
      const OpenTx = await createOpenTx(accounts);
      const dydxMargin = await Margin.deployed();

      OpenTx.loanOffering.owedToken = OpenTx.loanOffering.heldToken;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

      await issueTokensAndSetAllowances(OpenTx);

      await expectThrow(
        callOpenPosition(dydxMargin, OpenTx)
      );
    });
  });

  contract('Margin', accounts => {
    it('works with 0 fees', async () => {
      const OpenTx = await createOpenTx(accounts);
      const dydxMargin = await Margin.deployed();

      OpenTx.loanOffering.rates.lenderFee = BIGNUMBERS.ZERO;
      OpenTx.loanOffering.rates.takerFee = BIGNUMBERS.ZERO;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

      await issueTokensAndSetAllowances(OpenTx);

      await callOpenPosition(dydxMargin, OpenTx);

      await checkSuccess(dydxMargin, OpenTx);
    });
  });

  contract('Margin', accounts => {
    it('allows a specified taker to take the loan', async () => {
      const OpenTx = await createOpenTx(accounts);
      const dydxMargin = await Margin.deployed();

      OpenTx.loanOffering.taker = OpenTx.trader;
      OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

      await issueTokensAndSetAllowances(OpenTx);

      await callOpenPosition(dydxMargin, OpenTx);

      await checkSuccess(dydxMargin, OpenTx);
    });
  });
});

async function checkSuccess(dydxMargin, OpenTx) {
  const positionId = web3Instance.utils.soliditySha3(
    OpenTx.trader,
    OpenTx.nonce
  );

  const contains = await dydxMargin.containsPosition.call(positionId);
  expect(contains).to.equal(true);
  const position = await getPosition(dydxMargin, positionId);

  expect(position.owedToken).to.equal(OpenTx.owedToken);
  expect(position.heldToken).to.equal(OpenTx.heldToken);
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

  const {
    soldAmount,
    expectedHeldTokenFromSell,
    expectedHeldTokenBalance
  } = getTokenAmountsFromOpen(OpenTx);

  expect(balance).to.be.bignumber.equal(expectedHeldTokenBalance);

  const lenderFee = OpenTx.loanOffering.feeRecipient === ADDRESSES.ZERO ?
    0 : OpenTx.loanOffering.rates.lenderFee;
  const loanTakerFee = OpenTx.loanOffering.feeRecipient === ADDRESSES.ZERO ?
    0 : OpenTx.loanOffering.rates.takerFee;

  const [
    owedToken,
    heldToken,
    feeToken,
  ] = await Promise.all([
    OwedToken.deployed(),
    HeldToken.deployed(),
    FeeToken.deployed()
  ]);

  const [
    lenderOwedToken,
    makerOwedToken,
    exchangeWrapperOwedToken,
    traderHeldToken,
    makerHeldToken,
    vaultHeldToken,
    lenderFeeToken,
    makerFeeToken,
    exchangeWrapperFeeToken,
    traderFeeToken,
    loanOfferingFilledAmount
  ] = await Promise.all([
    owedToken.balanceOf.call(OpenTx.loanOffering.payer),
    owedToken.balanceOf.call(OpenTx.buyOrder.maker),
    owedToken.balanceOf.call(ExchangeWrapper.address),
    heldToken.balanceOf.call(OpenTx.trader),
    heldToken.balanceOf.call(OpenTx.buyOrder.maker),
    heldToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(OpenTx.loanOffering.payer),
    feeToken.balanceOf.call(OpenTx.buyOrder.maker),
    feeToken.balanceOf.call(ExchangeWrapper.address),
    feeToken.balanceOf.call(OpenTx.trader),
    dydxMargin.getLoanFilledAmount.call(OpenTx.loanOffering.loanHash)
  ]);

  expect(lenderOwedToken).to.be.bignumber.equal(
    OpenTx.loanOffering.rates.maxAmount.minus(OpenTx.principal)
  );
  expect(makerOwedToken).to.be.bignumber.equal(soldAmount);
  expect(exchangeWrapperOwedToken).to.be.bignumber.equal(0);
  expect(traderHeldToken).to.be.bignumber.equal(0);
  expect(makerHeldToken).to.be.bignumber.equal(
    OpenTx.buyOrder.makerTokenAmount.minus(expectedHeldTokenFromSell)
  );
  expect(vaultHeldToken).to.be.bignumber.equal(expectedHeldTokenBalance);
  expect(lenderFeeToken).to.be.bignumber.equal(
    OpenTx.loanOffering.rates.lenderFee
      .minus(
        getPartialAmount(
          OpenTx.principal,
          OpenTx.loanOffering.rates.maxAmount,
          lenderFee
        )
      )
  );
  expect(exchangeWrapperFeeToken).to.be.bignumber.equal(0);
  expect(makerFeeToken).to.be.bignumber.equal(
    OpenTx.buyOrder.makerFee
      .minus(
        getPartialAmount(
          soldAmount,
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
          loanTakerFee
        )
      )
      .minus(
        getPartialAmount(
          soldAmount,
          OpenTx.buyOrder.takerTokenAmount,
          OpenTx.buyOrder.takerFee
        )
      )
  );
  expect(loanOfferingFilledAmount).to.be.bignumber.eq(OpenTx.principal);
}
