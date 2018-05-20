/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require('TokenA');
const ProxyContract = artifacts.require('Proxy');
const TestDepositCollateralDelegator = artifacts.require('TestDepositCollateralDelegator');
const { BYTES32 } = require('../helpers/Constants');
const { expectThrow } = require('../helpers/ExpectHelper');
const { expectLog } = require('../helpers/EventHelper');
const {
  doOpenPosition,
  doOpenPositionAndCall,
  getPosition,
  issueTokenToAccountInAmountAndApproveProxy
} = require('../helpers/MarginHelper');
const { issueAndSetAllowance } = require('../helpers/TokenHelper');

describe('#deposit', () => {
  contract('Margin', accounts => {
    it('deposits additional funds into the position', async () => {

      const OpenTx = await doOpenPosition(accounts);
      const amount = new BigNumber(1000);

      const tx = await doDepositCollateral({
        from: OpenTx.trader,
        OpenTx,
        printGas: true,
        amount: amount
      });

      expectLog(tx.logs[0], 'AdditionalCollateralDeposited', {
        positionId: OpenTx.id,
        amount: amount,
        depositor: OpenTx.trader
      });
    });
  });

  contract('Margin', accounts => {
    it('doesnt allow anyone but position owner to deposit', async () => {
      const OpenTx = await doOpenPosition(accounts);
      await expectThrow(
        doDepositCollateral({
          from: accounts[9],
          OpenTx,
        })
      );
    });
  });

  contract('Margin', accounts => {
    it('fails for invalid positionId', async () => {
      const OpenTx = await doOpenPosition(accounts);

      await expectThrow(
        doDepositCollateral({
          from: OpenTx.trader,
          OpenTx: { id: BYTES32.BAD_ID },
          amount: 0
        })
      );
    });
  });

  contract('Margin', accounts => {
    it('fails on zero-amount deposit', async () => {
      const OpenTx = await doOpenPosition(accounts);

      await expectThrow(
        doDepositCollateral({
          from: OpenTx.trader,
          OpenTx,
          amount: 0
        })
      );
    });
  });

  contract('Margin', accounts => {
    it('allows depositCollateralOnBehalfOf', async () => {
      const depositor = accounts[9];
      const rando = accounts[8];
      const depositAmount = new BigNumber('1e18');

      const dydxMargin = await Margin.deployed();
      const heldToken = await HeldToken.deployed();

      // set up position
      const delegatorContract = await TestDepositCollateralDelegator.new(
        dydxMargin.address,
        depositor
      );
      const openTx = await doOpenPosition(accounts);
      await dydxMargin.transferPosition(
        openTx.id,
        delegatorContract.address,
        { from: openTx.owner }
      );

      // fails for non-approved depositor
      await issueTokenToAccountInAmountAndApproveProxy(heldToken, rando, depositAmount);
      await expectThrow(
        dydxMargin.depositCollateral(
          openTx.id,
          depositAmount,
          { from: rando }
        )
      );

      const balance1 = await dydxMargin.getPositionBalance.call(openTx.id);

      // succeeds for approved depositor
      await issueTokenToAccountInAmountAndApproveProxy(heldToken, depositor, depositAmount);
      await dydxMargin.depositCollateral(
        openTx.id,
        depositAmount,
        { from: depositor }
      );

      const balance2 = await dydxMargin.getPositionBalance.call(openTx.id);
      expect(balance2.minus(balance1)).to.be.bignumber.equal(depositAmount);
    });
  });

  contract('Margin', accounts => {
    it('allows deposit in increments', async () => {
      const dydxMargin = await Margin.deployed();
      const { OpenTx } = await doOpenPositionAndCall(accounts);

      let { requiredDeposit } = await getPosition(dydxMargin, OpenTx.id);

      await doDepositCollateral({
        from: OpenTx.trader,
        OpenTx,
        amount: requiredDeposit.minus(5)
      });

      let position = await getPosition(dydxMargin, OpenTx.id);
      requiredDeposit = position.requiredDeposit;
      let callTimestamp = position.callTimestamp;
      expect(requiredDeposit).to.be.bignumber.eq(5);
      expect(callTimestamp).to.be.bignumber.gt(new BigNumber(0));

      const amount2 = 5;
      const tx2 = await doDepositCollateral({
        from: OpenTx.trader,
        OpenTx,
        amount: amount2
      });

      expectLog(tx2.logs[1], 'MarginCallCanceled', {
        positionId: OpenTx.id,
        lender: OpenTx.loanOffering.owner,
        owner: OpenTx.trader,
        depositAmount: amount2
      });

      position = await getPosition(dydxMargin, OpenTx.id);
      requiredDeposit = position.requiredDeposit;
      callTimestamp = position.callTimestamp;
      expect(requiredDeposit).to.be.bignumber.eq(0);
      expect(callTimestamp).to.be.bignumber.eq(0);
    });
  });
});

async function doDepositCollateral({
  from,
  OpenTx,
  printGas = false,
  amount = new BigNumber(1000)
}) {
  const [dydxMargin, heldToken] = await Promise.all([
    Margin.deployed(),
    HeldToken.deployed()
  ]);

  const initialBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);

  await issueAndSetAllowance(
    heldToken,
    from,
    amount,
    ProxyContract.address
  );

  const tx = await dydxMargin.depositCollateral(
    OpenTx.id,
    amount,
    { from }
  );

  if (printGas) {
    console.log('\tMargin.depositCollateral gas used: ' + tx.receipt.gasUsed);
  }

  const newBalance = await dydxMargin.getPositionBalance.call(OpenTx.id);

  expect(newBalance).to.be.bignumber.equal(initialBalance.plus(amount));

  expectLog(tx.logs[0], 'AdditionalCollateralDeposited', {
    positionId: OpenTx.id,
    amount: amount,
    depositor: from
  });

  return tx;
}
