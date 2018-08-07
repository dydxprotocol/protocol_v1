const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const { wait } = require('@digix/tempo')(web3);

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const { ADDRESSES } = require('../../helpers/Constants');
const { getPartialAmount } = require('../../helpers/MathHelper');
const { signLoanOffering } = require('../../helpers/LoanHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');
const {
  getPosition,
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition,
  issueTokenToAccountInAmountAndApproveProxy,
} = require('../../helpers/MarginHelper');

describe('#increaseWithoutCounterparty', () => {
  contract('Margin', accounts => {
    it('succeeds on valid inputs', async () => {
      const {
        dydxMargin,
        openTx,
        addAmount,
        adder,
        startingBalance,
        heldToken,
        testPositionOwner,
        testLoanOwner
      } = await setup(accounts);

      const tx = await dydxMargin.increaseWithoutCounterparty(
        openTx.id,
        addAmount,
        { from: adder }
      );

      console.log('\tMargin.increaseWithoutCounterparty gas used: ' + tx.receipt.gasUsed);

      const position = await getPosition(dydxMargin, openTx.id);

      expect(position.principal).to.be.bignumber.eq(
        openTx.principal.plus(addAmount)
      );

      const finalBalance = await dydxMargin.getPositionBalance.call(openTx.id);
      const startingHeldTokenBalancePerUnit = getPartialAmount(startingBalance, openTx.principal);
      const finalHeldTokenPerUnit =
        getPartialAmount(finalBalance, openTx.principal.plus(addAmount));

      expect(finalHeldTokenPerUnit).to.be.bignumber.eq(startingHeldTokenBalancePerUnit);

      const [
        adderHeldToken,
        afterIncreasePosition,
        adderLoanValueAdded
      ] = await Promise.all([
        heldToken.balanceOf.call(adder),
        testPositionOwner.valueAdded.call(openTx.id, adder),
        testLoanOwner.valueAdded.call(openTx.id, adder),
      ]);

      expect(adderHeldToken).to.be.bignumber.eq(0);
      expect(afterIncreasePosition).to.be.bignumber.eq(addAmount);
      expect(adderLoanValueAdded).to.be.bignumber.eq(addAmount);
    });
  });

  contract('Margin', accounts => {
    it('disallows increasing by 0', async () => {
      const {
        dydxMargin,
        openTx,
        adder
      } = await setup(accounts);

      await expectThrow(dydxMargin.increaseWithoutCounterparty(
        openTx.id,
        0,
        { from: adder }
      ));
    });
  });

  contract('Margin', accounts => {
    it('does not allow increasing after maximum duration', async () => {
      const {
        dydxMargin,
        openTx,
        adder,
        addAmount
      } = await setup(accounts);

      await wait(openTx.loanOffering.maxDuration + 1);

      await expectThrow(dydxMargin.increaseWithoutCounterparty(
        openTx.id,
        addAmount,
        { from: adder }
      ));
    });
  });

  async function setup(accounts) {
    const [
      openTx,
      dydxMargin,
      heldToken,
      testPositionOwner,
      testLoanOwner
    ] = await Promise.all([
      createOpenTx(accounts),
      Margin.deployed(),
      HeldToken.deployed(),
      TestPositionOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ONE, 0),
      TestLoanOwner.new(Margin.address, ADDRESSES.ONE, ADDRESSES.ONE),
    ]);

    openTx.owner = testPositionOwner.address;
    openTx.loanOffering.owner = testLoanOwner.address;
    openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);

    await issueTokensAndSetAllowances(openTx);
    const response = await callOpenPosition(dydxMargin, openTx);
    openTx.id = response.id;

    const [ownsPosition, ownsLoan, startingBalance] = await Promise.all([
      testPositionOwner.hasReceived.call(openTx.id, openTx.trader),
      testLoanOwner.hasReceived.call(openTx.id, openTx.loanOffering.payer),
      dydxMargin.getPositionBalance.call(openTx.id),
    ]);

    expect(ownsPosition).to.be.true;
    expect(ownsLoan).to.be.true;

    const addAmount = openTx.principal.div(2).floor();
    const adder = accounts[8];
    const heldTokenAmount = getPartialAmount(
      addAmount,
      openTx.principal,
      startingBalance,
      true
    );

    await issueTokenToAccountInAmountAndApproveProxy(
      heldToken,
      adder,
      heldTokenAmount
    );

    return {
      dydxMargin,
      openTx,
      addAmount,
      adder,
      startingBalance,
      heldToken,
      testPositionOwner,
      testLoanOwner
    };
  }
});
