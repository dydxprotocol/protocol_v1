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
  doClosePosition,
  getPosition,
  callApproveLoanOffering,
  getTokenAmountsFromOpen
} = require('../helpers/MarginHelper');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');

describe('#openPosition', () => {
  contract('Margin', accounts => {
    it('succeeds on valid inputs', async () => {
      const { dydxMargin, openTx } = await getMarginAndOpenTx(accounts);

      await issueTokensAndSetAllowances(openTx);

      const tx = await callOpenPosition(dydxMargin, openTx);

      console.log('\tMargin.openPosition (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(dydxMargin, openTx);
    });
  });

  contract('Margin', accounts => {
    it('succeeds when deposit is paid in owedToken', async () => {
      const openTx = await createOpenTx(accounts, { depositInHeldToken: false });
      const dydxMargin = await Margin.deployed();

      await issueTokensAndSetAllowances(openTx);

      const tx = await callOpenPosition(dydxMargin, openTx);

      console.log(
        '\tMargin.openPosition (owedToken deposit / 0x Exchange Contract) gas used: '
        + tx.receipt.gasUsed
      );

      await checkSuccess(dydxMargin, openTx);
    });
  });

  contract('Margin', accounts => {
    it('allows smart contracts to be lenders', async () => {
      const openTx = await createOpenTx(accounts);
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

      await issueTokensAndSetAllowances(openTx);

      const [
        lenderFeeTokenBalance,
        lenderOwedTokenBalance
      ] = await Promise.all([
        feeToken.balanceOf.call(openTx.loanOffering.payer),
        owedToken.balanceOf.call(openTx.loanOffering.payer)
      ]);
      await Promise.all([
        feeToken.transfer(
          testSmartContractLender.address,
          lenderFeeTokenBalance,
          { from: openTx.loanOffering.payer }
        ),
        owedToken.transfer(
          testSmartContractLender.address,
          lenderOwedTokenBalance,
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
          owedToken.address,
          ProxyContract.address,
          lenderOwedTokenBalance
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

      const tx = await callOpenPosition(dydxMargin, openTx);

      console.log('\tMargin.openPosition (smart contract lender) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(dydxMargin, openTx);
    });
  });

  contract('Margin', accounts => {
    it('allows smart contracts to specify other addresses', async () => {
      const openTx = await createOpenTx(accounts);
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

      await issueTokensAndSetAllowances(openTx);

      const [
        lenderFeeTokenBalance,
        lenderOwedTokenBalance
      ] = await Promise.all([
        feeToken.balanceOf.call(openTx.loanOffering.payer),
        owedToken.balanceOf.call(openTx.loanOffering.payer)
      ]);
      await Promise.all([
        feeToken.transfer(
          testSmartContractLender.address,
          lenderFeeTokenBalance,
          { from: openTx.loanOffering.payer }
        ),
        owedToken.transfer(
          testSmartContractLender.address,
          lenderOwedTokenBalance,
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
          owedToken.address,
          ProxyContract.address,
          lenderOwedTokenBalance
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

      const tx = await callOpenPosition(dydxMargin, openTx);

      console.log('\tMargin.openPosition (smart contract lender) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(dydxMargin, openTx);
    });
  });

  contract('Margin', accounts => {
    it('does not allow ownership to be assigned to contracts w/o proper interface', async () => {
      const [
        dydxMargin,
        testLoanOwner,
        testPositionOwner,
        openTx1,
        openTx2
      ] = await Promise.all([
        Margin.deployed(),
        TestLoanOwner.new(Margin.address, ADDRESSES.ZERO, ADDRESSES.ZERO),
        TestPositionOwner.new(Margin.address, ADDRESSES.ZERO, ADDRESSES.ZERO, 0),
        createOpenTx(accounts),
        createOpenTx(accounts)
      ]);

      openTx1.owner = testLoanOwner.address; // loan owner can't take ownership
      openTx2.loanOffering.owner = testPositionOwner.address; // owner can't take loan
      [
        openTx1.loanOffering.signature,
        openTx2.loanOffering.signature
      ] = await Promise.all([
        signLoanOffering(openTx1.loanOffering),
        signLoanOffering(openTx2.loanOffering)
      ]);

      await issueTokensAndSetAllowances(openTx1);
      await expectThrow(callOpenPosition(dydxMargin, openTx1));

      await issueTokensAndSetAllowances(openTx2);
      await expectThrow(callOpenPosition(dydxMargin, openTx2));
    });
  });

  contract('Margin', accounts => {
    it('does not allow the same nonce to be used twice', async () => {
      const extraArgs = { collisionCheck: false };
      const [
        dydxMargin,
        openTx1,
        openTx2,
        openTx3
      ] = await Promise.all([
        Margin.deployed(),
        createOpenTx(accounts, { nonce: 1}),
        createOpenTx(accounts, { nonce: 1}),
        createOpenTx(accounts, { nonce: 2}),
      ]);

      await issueTokensAndSetAllowances(openTx1);
      await callOpenPosition(dydxMargin, openTx1, extraArgs);

      // using the same nonce again should fail
      await issueTokensAndSetAllowances(openTx2);
      await expectThrow(
        callOpenPosition(dydxMargin, openTx2, extraArgs)
      );

      // prove that it still works for a different nonce
      await callOpenPosition(dydxMargin, openTx3, extraArgs);
    });
  });

  contract('Margin', accounts => {
    it('does not allow the same nonce to be used twice, even if the first was closed', async () => {
      const extraArgs = { collisionCheck: false };
      let [
        dydxMargin,
        openTx1,
        openTx2,
        openTx3
      ] = await Promise.all([
        Margin.deployed(),
        createOpenTx(accounts, { nonce: 1}),
        createOpenTx(accounts, { nonce: 1}),
        createOpenTx(accounts, { nonce: 2}),
      ]);

      await issueTokensAndSetAllowances(openTx1);
      const response = await callOpenPosition(dydxMargin, openTx1, extraArgs);
      openTx1.id = response.id;
      await doClosePosition(accounts, openTx1,  openTx1.principal);
      const closed = await dydxMargin.isPositionClosed.call(openTx1.id);
      expect(closed).to.be.true;

      // using the same nonce again should fail
      await issueTokensAndSetAllowances(openTx2);
      await expectThrow(
        callOpenPosition(dydxMargin, openTx2, extraArgs)
      );

      // prove that it still works for a different nonce
      await callOpenPosition(dydxMargin, openTx3, extraArgs);
    });
  });

  contract('Margin', accounts => {
    it('does not allow position owner to be zero', async () => {
      const { dydxMargin, openTx } = await getMarginAndOpenTx(accounts);
      await issueTokensAndSetAllowances(openTx);
      openTx.owner = ADDRESSES.ZERO;
      await expectThrow(
        callOpenPosition(dydxMargin, openTx)
      );
    });
  });

  contract('Margin', accounts => {
    it('does not allow loan owner to be zero', async () => {
      const { dydxMargin, openTx } = await getMarginAndOpenTx(accounts);
      await issueTokensAndSetAllowances(openTx);
      openTx.loanOffering.owner = ADDRESSES.ZERO;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
      await expectThrow(
        callOpenPosition(dydxMargin, openTx)
      );
    });
  });

  contract('Margin', accounts => {
    it('properly assigns owner for lender and owner for accounts', async () => {
      const { dydxMargin, openTx } = await getMarginAndOpenTx(accounts);
      await issueTokensAndSetAllowances(openTx);
      openTx.owner = accounts[8];
      openTx.loanOffering.owner = accounts[9];
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
      await callOpenPosition(dydxMargin, openTx);
      await checkSuccess(dydxMargin, openTx);
    });
  });

  contract('Margin', accounts => {
    it('properly assigns owner for lender and owner for contracts', async () => {
      const [
        dydxMargin,
        testMarginCallDelegator,
        testClosePositionDelegator,
        openTx
      ] = await Promise.all([
        Margin.deployed(),
        TestMarginCallDelegator.new(
          Margin.address,
          ADDRESSES.ZERO,
          ADDRESSES.ZERO
        ),
        TestClosePositionDelegator.new(
          Margin.address,
          ADDRESSES.ZERO,
          false
        ),
        createOpenTx(accounts)
      ]);
      await issueTokensAndSetAllowances(openTx);
      openTx.owner = testClosePositionDelegator.address;
      openTx.loanOffering.owner = testMarginCallDelegator.address;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
      await callOpenPosition(dydxMargin, openTx);
      await checkSuccess(dydxMargin, openTx);
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
        ADDRESSES.ZERO);
      const testPositionOwner = await TestPositionOwner.new(
        Margin.address,
        testClosePositionDelegator.address,
        false,
        0);
      const openTx = await createOpenTx(accounts);
      await issueTokensAndSetAllowances(openTx);
      openTx.owner = testPositionOwner.address;
      openTx.loanOffering.owner = testLoanOwner.address;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
      await callOpenPosition(dydxMargin, openTx);
      await checkSuccess(dydxMargin, openTx);
    });
  });

  contract('Margin', accounts => {
    it('succeeds with on-chain approved loan offerings', async () => {
      const { dydxMargin, openTx } = await getMarginAndOpenTx(accounts);

      await issueTokensAndSetAllowances(openTx);
      await callApproveLoanOffering(dydxMargin, openTx.loanOffering, openTx.loanOffering.signer);

      openTx.loanOffering.signature.v = 0;
      openTx.loanOffering.signature.r = "";
      openTx.loanOffering.signature.s = "";

      await callOpenPosition(dydxMargin, openTx);

      await checkSuccess(dydxMargin, openTx);
    });
  });

  contract('Margin', accounts => {
    it('does not transfer fees if fee address is 0', async () => {
      const { dydxMargin, openTx } = await getMarginAndOpenTx(accounts);

      openTx.loanOffering.feeRecipient = ADDRESSES.ZERO;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

      await issueTokensAndSetAllowances(openTx);

      await callOpenPosition(dydxMargin, openTx);

      await checkSuccess(dydxMargin, openTx);
    });
  });

  contract('Margin', accounts => {
    it('fails if owedToken equals heldToken', async () => {
      const { dydxMargin, openTx } = await getMarginAndOpenTx(accounts);

      openTx.loanOffering.owedToken = openTx.loanOffering.heldToken;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

      await issueTokensAndSetAllowances(openTx);

      await expectThrow(
        callOpenPosition(dydxMargin, openTx)
      );
    });
  });

  contract('Margin', accounts => {
    it('works with 0 fees', async () => {
      const { dydxMargin, openTx } = await getMarginAndOpenTx(accounts);

      openTx.loanOffering.rates.lenderFee = BIGNUMBERS.ZERO;
      openTx.loanOffering.rates.takerFee = BIGNUMBERS.ZERO;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

      await issueTokensAndSetAllowances(openTx);

      await callOpenPosition(dydxMargin, openTx);

      await checkSuccess(dydxMargin, openTx);
    });
  });

  contract('Margin', accounts => {
    it('allows a specified taker to take the loan', async () => {
      const { dydxMargin, openTx } = await getMarginAndOpenTx(accounts);

      openTx.loanOffering.taker = openTx.trader;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

      await issueTokensAndSetAllowances(openTx);

      await callOpenPosition(dydxMargin, openTx);

      await checkSuccess(dydxMargin, openTx);
    });
  });
});

async function getMarginAndOpenTx(accounts) {
  const [
    dydxMargin,
    openTx
  ] = await Promise.all([
    Margin.deployed(),
    createOpenTx(accounts)
  ]);
  return { dydxMargin, openTx };
}

async function checkSuccess(dydxMargin, openTx) {
  const positionId = web3Instance.utils.soliditySha3(
    openTx.trader,
    openTx.nonce
  );

  const contains = await dydxMargin.containsPosition.call(positionId);
  expect(contains).to.equal(true);
  const position = await getPosition(dydxMargin, positionId);

  expect(position.owedToken).to.equal(openTx.owedToken);
  expect(position.heldToken).to.equal(openTx.heldToken);
  expect(position.principal).to.be.bignumber.equal(openTx.principal);
  expect(position.interestRate).to.be.bignumber.equal(
    openTx.loanOffering.rates.interestRate);
  expect(position.callTimeLimit).to.be.bignumber.equal(openTx.loanOffering.callTimeLimit);
  expect(position.callTimestamp).to.be.bignumber.equal(0);
  expect(position.maxDuration).to.be.bignumber.equal(openTx.loanOffering.maxDuration);

  let toReturn = null;
  try {
    toReturn = await TestPositionOwner.at(openTx.owner).TO_RETURN.call();
  } catch(e) {
    toReturn = null;
  }
  expect(position.owner).to.equal(toReturn || openTx.owner);
  try {
    toReturn = await TestLoanOwner.at(openTx.loanOffering.owner).TO_RETURN.call();
  } catch(e) {
    toReturn = null;
  }
  expect(position.lender).to.equal(toReturn || openTx.loanOffering.owner);

  const balance = await dydxMargin.getPositionBalance.call(positionId);

  const {
    soldAmount,
    expectedHeldTokenFromSell,
    expectedHeldTokenBalance
  } = getTokenAmountsFromOpen(openTx);

  expect(balance).to.be.bignumber.equal(expectedHeldTokenBalance);

  const lenderFee = openTx.loanOffering.feeRecipient === ADDRESSES.ZERO ?
    0 : openTx.loanOffering.rates.lenderFee;
  const loanTakerFee = openTx.loanOffering.feeRecipient === ADDRESSES.ZERO ?
    0 : openTx.loanOffering.rates.takerFee;

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
    owedToken.balanceOf.call(openTx.loanOffering.payer),
    owedToken.balanceOf.call(openTx.buyOrder.maker),
    owedToken.balanceOf.call(ExchangeWrapper.address),
    heldToken.balanceOf.call(openTx.trader),
    heldToken.balanceOf.call(openTx.buyOrder.maker),
    heldToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(openTx.loanOffering.payer),
    feeToken.balanceOf.call(openTx.buyOrder.maker),
    feeToken.balanceOf.call(ExchangeWrapper.address),
    feeToken.balanceOf.call(openTx.trader),
    dydxMargin.getLoanFilledAmount.call(openTx.loanOffering.loanHash)
  ]);

  expect(lenderOwedToken).to.be.bignumber.equal(
    openTx.loanOffering.rates.maxAmount.minus(openTx.principal)
  );
  expect(makerOwedToken).to.be.bignumber.equal(soldAmount);
  expect(exchangeWrapperOwedToken).to.be.bignumber.equal(0);
  expect(traderHeldToken).to.be.bignumber.equal(0);
  expect(makerHeldToken).to.be.bignumber.equal(
    openTx.buyOrder.makerTokenAmount.minus(expectedHeldTokenFromSell)
  );
  expect(vaultHeldToken).to.be.bignumber.equal(expectedHeldTokenBalance);
  expect(lenderFeeToken).to.be.bignumber.equal(
    openTx.loanOffering.rates.lenderFee
      .minus(
        getPartialAmount(
          openTx.principal,
          openTx.loanOffering.rates.maxAmount,
          lenderFee
        )
      )
  );
  expect(exchangeWrapperFeeToken).to.be.bignumber.equal(0);
  expect(makerFeeToken).to.be.bignumber.equal(
    openTx.buyOrder.makerFee
      .minus(
        getPartialAmount(
          soldAmount,
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
          openTx.principal,
          openTx.loanOffering.rates.maxAmount,
          loanTakerFee
        )
      )
      .minus(
        getPartialAmount(
          soldAmount,
          openTx.buyOrder.takerTokenAmount,
          openTx.buyOrder.takerFee
        )
      )
  );
  expect(loanOfferingFilledAmount).to.be.bignumber.eq(openTx.principal);
}
