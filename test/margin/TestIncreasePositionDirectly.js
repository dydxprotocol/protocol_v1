/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const { wait } = require('@digix/tempo')(web3);

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require("TokenA");
const TestPositionOwner = artifacts.require("TestPositionOwner");
const TestLoanOwner = artifacts.require("TestLoanOwner");
const { ADDRESSES } = require('../helpers/Constants');
const { getPartialAmount } = require('../helpers/MathHelper');
const { signLoanOffering } = require('../helpers/LoanHelper');
const { expectThrow } = require('../helpers/ExpectHelper');

const {
  getPosition,
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition,
  issueTokenToAccountInAmountAndApproveProxy,
} = require('../helpers/MarginHelper');

describe('#increasePositionDirectly', () => {
  contract('Margin', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const {
        dydxMargin,
        OpenTx,
        addAmount,
        adder,
        startingBalance,
        heldToken,
        testPositionOwner,
        testLoanOwner
      } = await setup(accounts);

      const tx = await dydxMargin.increasePositionDirectly(
        OpenTx.id,
        addAmount,
        { from: adder }
      );

      console.log('\tMargin.increasePositionDirectly gas used: ' + tx.receipt.gasUsed);

      const position = await getPosition(dydxMargin, OpenTx.id);

      expect(position.principal).to.be.bignumber.eq(
        OpenTx.principal.plus(addAmount)
      );

      const finalBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);
      const startingHeldTokenBalancePerUnit = getPartialAmount(startingBalance, OpenTx.principal);
      const finalHeldTokenPerUnit =
        getPartialAmount(finalBalance, OpenTx.principal.plus(addAmount));

      expect(finalHeldTokenPerUnit).to.be.bignumber.eq(startingHeldTokenBalancePerUnit);

      const [
        adderHeldToken,
        afterIncreasePosition,
        adderLoanValueAdded
      ] = await Promise.all([
        heldToken.balanceOf.call(adder),
        testPositionOwner.valueAdded.call(OpenTx.id, adder),
        testLoanOwner.valueAdded.call(OpenTx.id, adder),
      ]);

      expect(adderHeldToken).to.be.bignumber.eq(0);
      expect(afterIncreasePosition).to.be.bignumber.eq(addAmount);
      expect(adderLoanValueAdded).to.be.bignumber.eq(addAmount);
    });
  });

  contract('Margin', function(accounts) {
    it('disallows increasing by 0', async () => {
      const {
        dydxMargin,
        OpenTx,
        adder
      } = await setup(accounts);

      await expectThrow(dydxMargin.increasePositionDirectly(
        OpenTx.id,
        0,
        { from: adder }
      ));
    });
  });

  contract('Margin', function(accounts) {
    it('does not allow increasing after maximum duration', async () => {
      const {
        dydxMargin,
        OpenTx,
        adder,
        addAmount
      } = await setup(accounts);

      await wait(OpenTx.loanOffering.maxDuration + 1);

      await expectThrow(dydxMargin.increasePositionDirectly(
        OpenTx.id,
        addAmount,
        { from: adder }
      ));
    });
  });

  async function setup(accounts) {
    const [
      OpenTx,
      dydxMargin,
      heldToken,
      testPositionOwner,
      testLoanOwner
    ] = await Promise.all([
      createOpenTx(accounts),
      Margin.deployed(),
      HeldToken.deployed(),
      TestPositionOwner.new(Margin.address, ADDRESSES.ONE, true, 0),
      TestLoanOwner.new(Margin.address, ADDRESSES.ONE, true),
    ]);

    OpenTx.owner = testPositionOwner.address;
    OpenTx.loanOffering.owner = testLoanOwner.address;
    OpenTx.loanOffering.signature = await signLoanOffering(OpenTx.loanOffering);

    await issueTokensAndSetAllowances(OpenTx);
    const response = await callOpenPosition(dydxMargin, OpenTx);
    OpenTx.id = response.id;

    const [ownsPosition, ownsLoan, startingBalance] = await Promise.all([
      testPositionOwner.hasReceived.call(OpenTx.id, OpenTx.trader),
      testLoanOwner.hasReceived.call(OpenTx.id, OpenTx.loanOffering.payer),
      dydxMargin.getPositionBalance.call(OpenTx.id),
    ]);

    expect(ownsPosition).to.be.true;
    expect(ownsLoan).to.be.true;

    const addAmount = OpenTx.principal.div(2);
    const adder = accounts[8];
    const heldTokenAmount = getPartialAmount(
      addAmount,
      OpenTx.principal,
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
      OpenTx,
      addAmount,
      adder,
      startingBalance,
      heldToken,
      testPositionOwner,
      testLoanOwner
    };
  }
});
