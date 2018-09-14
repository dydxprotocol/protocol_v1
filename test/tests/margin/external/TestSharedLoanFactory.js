const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const SharedLoanFactory = artifacts.require("SharedLoanFactory");
const SharedLoan = artifacts.require("SharedLoan");
const Margin = artifacts.require("Margin");

const { BIGNUMBERS } = require('../../../helpers/Constants');
const { expectAssertFailure, expectThrow } = require('../../../helpers/ExpectHelper');
const { getSharedLoanConstants, SHARED_LOAN_STATE } = require('./SharedLoanHelper');
const { createSignedV1SellOrder } = require('../../../helpers/ZeroExV1Helper');
const { signLoanOffering } = require('../../../helpers/LoanHelper');
const {
  callOpenPosition,
  doOpenPosition,
  createOpenTx,
  issueTokensAndSetAllowances,
  issueTokensAndSetAllowancesForClose,
  callClosePosition
} = require('../../../helpers/MarginHelper');

contract('SharedLoanFactory', accounts => {

  // ============ Constants ============

  let salt = 578123;
  let dydxMargin;
  let sharedLoanFactoryContract;

  // ============ Helper-Functions ============

  async function checkSuccess(openTx, sharedLoanContract, remainingPrincipal) {
    const payer = openTx.loanOffering.payer;

    const slc = await getSharedLoanConstants(sharedLoanContract, payer);

    expect(slc.MarginAddress).to.equal(dydxMargin.address);
    expect(slc.InitialLender).to.equal(payer);
    expect(slc.PositionId).to.equal(openTx.id);
    expect(slc.State).to.be.bignumber.equal(SHARED_LOAN_STATE.OPEN);
    expect(slc.OwedToken).to.equal(openTx.loanOffering.owedToken);
    expect(slc.HeldToken).to.equal(openTx.loanOffering.heldToken);
    expect(slc.TotalPrincipal).to.be.bignumber.equal(remainingPrincipal);
    expect(slc.TotalPrincipalFullyWithdrawn).to.be.bignumber.equal(BIGNUMBERS.ZERO);
    expect(slc.TotalOwedTokenWithdrawn).to.be.bignumber.equal(BIGNUMBERS.ZERO);
    expect(slc.BalancesLender).to.be.bignumber.equal(remainingPrincipal);
    expect(slc.BalancesZero).to.be.bignumber.equal(BIGNUMBERS.ZERO);
    expect(slc.OwedTokenWithdrawnEarlyLender).to.be.bignumber.equal(BIGNUMBERS.ZERO);
    expect(slc.OwedTokenWithdrawnEarlyZero).to.be.bignumber.equal(BIGNUMBERS.ZERO);
  }

  // ============ Before ============

  before('retrieve deployed contracts', async () => {
    [
      dydxMargin,
      sharedLoanFactoryContract
    ] = await Promise.all([
      Margin.deployed(),
      SharedLoanFactory.deployed()
    ]);
  });

  // ============ Tests ============

  describe('Constructor', () => {
    let contract;
    it('sets constants correctly', async () => {
      const trustedMarginCallersExpected = [accounts[8], accounts[9]];
      contract = await SharedLoanFactory.new(Margin.address, trustedMarginCallersExpected);
      const dydxMarginAddress = await contract.DYDX_MARGIN.call();
      expect(dydxMarginAddress).to.equal(Margin.address);

      const numCallers = trustedMarginCallersExpected.length;
      for(let i = 0; i < numCallers; i++) {
        const trustedCaller = await contract.TRUSTED_MARGIN_CALLERS.call(i);
        expect(trustedCaller).to.equal(trustedMarginCallersExpected[i]);
      }

      // cannot read from past the length of the array
      await expectAssertFailure(contract.TRUSTED_MARGIN_CALLERS.call(numCallers));
    });
  });

  describe('#receiveLoanOwnership', () => {
    it('fails for arbitrary caller', async () => {
      const openTx = await doOpenPosition(accounts, { salt });
      await expectThrow(
        sharedLoanFactoryContract.receiveLoanOwnership(accounts[0], openTx.id)
      );
    });

    it('succeeds for new position', async () => {
      const openTx = await createOpenTx(accounts, { salt: salt++ });
      openTx.loanOffering.owner = sharedLoanFactoryContract.address;
      openTx.loanOffering.signature = await signLoanOffering(openTx.loanOffering);
      await issueTokensAndSetAllowances(openTx);
      const response = await callOpenPosition(dydxMargin, openTx);
      openTx.id = response.id;
      const sharedLoanAddress = await dydxMargin.getPositionLender.call(openTx.id);
      const sharedLoanContract = await SharedLoan.at(sharedLoanAddress);

      await checkSuccess(openTx, sharedLoanContract, openTx.principal);
    });

    it('succeeds for half-closed position', async () => {
      const openTx = await doOpenPosition(accounts, { salt: salt++ });
      // close half the position
      const sellOrder = await createSignedV1SellOrder(accounts, { salt: salt++ });
      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
      await callClosePosition(
        dydxMargin,
        openTx,
        sellOrder,
        openTx.principal.div(2).floor());

      // transfer loan to SharedLoanFactory
      await dydxMargin.transferLoan(
        openTx.id,
        sharedLoanFactoryContract.address,
        { from: openTx.loanOffering.owner }
      );

      const sharedLoanAddress = await dydxMargin.getPositionLender.call(openTx.id);
      const sharedLoanContract = await SharedLoan.at(sharedLoanAddress);
      await checkSuccess(openTx, sharedLoanContract, openTx.principal.div(2).floor());
    });
  });
});
