/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const QuoteToken = artifacts.require('TokenA');
const ProxyContract = artifacts.require('Proxy');
const { BYTES32 } = require('../helpers/Constants');
const { expectThrow } = require('../helpers/ExpectHelper');
const { expectLog } = require('../helpers/EventHelper');
const {
  doOpenPosition,
  doOpenPositionAndCall,
  getPosition
} = require('../helpers/MarginHelper');

describe('#deposit', () => {
  contract('Margin', function(accounts) {
    it('deposits additional funds into the margin position', async () => {

      const openTx = await doOpenPosition(accounts);
      const amount = new BigNumber(1000);

      const tx = await doDeposit({
        from: openTx.trader,
        openTx,
        printGas: true,
        amount: amount
      });

      expectLog(tx.logs[0], 'AdditionalCollateralDeposited', {
        marginId: openTx.id,
        amount: amount,
        depositor: openTx.trader
      });
    });
  });

  contract('Margin', function(accounts) {
    it('doesnt allow anyone but margin trader to deposit', async () => {
      const openTx = await doOpenPosition(accounts);
      await expectThrow(
        doDeposit({
          from: accounts[9],
          openTx,
        })
      );
    });
  });

  contract('Margin', function(accounts) {
    it('fails for invalid marginId', async () => {
      const openTx = await doOpenPosition(accounts);

      await expectThrow(
        doDeposit({
          from: openTx.trader,
          openTx: { id: BYTES32.BAD_ID },
          amount: 0
        })
      );
    });
  });

  contract('Margin', function(accounts) {
    it('fails on zero-amount deposit', async () => {
      const openTx = await doOpenPosition(accounts);

      await expectThrow(
        doDeposit({
          from: openTx.trader,
          openTx,
          amount: 0
        })
      );
    });
  });

  contract('Margin', function(accounts) {
    it('allows deposit in increments', async () => {
      const margin = await Margin.deployed();
      const { openTx } = await doOpenPositionAndCall(accounts);

      let { requiredDeposit } = await getPosition(margin, openTx.id);

      await doDeposit({
        from: openTx.trader,
        openTx,
        amount: requiredDeposit.minus(5)
      });

      let position = await getPosition(margin, openTx.id);
      requiredDeposit = position.requiredDeposit;
      let callTimestamp = position.callTimestamp;
      expect(requiredDeposit).to.be.bignumber.eq(5);
      expect(callTimestamp).to.be.bignumber.gt(new BigNumber(0));

      const amount2 = 5;
      const tx2 = await doDeposit({
        from: openTx.trader,
        openTx,
        amount: amount2
      });

      expectLog(tx2.logs[1], 'MarginCallCanceled', {
        marginId: openTx.id,
        lender: openTx.loanOffering.owner,
        trader: openTx.trader,
        depositAmount: amount2
      });

      position = await getPosition(margin, openTx.id);
      requiredDeposit = position.requiredDeposit;
      callTimestamp = position.callTimestamp;
      expect(requiredDeposit).to.be.bignumber.eq(0);
      expect(callTimestamp).to.be.bignumber.eq(0);
    });
  });
});

async function doDeposit({
  from,
  openTx,
  printGas = false,
  amount = new BigNumber(1000)
}) {
  const [margin, quoteToken] = await Promise.all([
    Margin.deployed(),
    QuoteToken.deployed()
  ]);

  const initialBalance = await margin.getPositionBalance.call(openTx.id);
  await quoteToken.issue(amount, { from });
  await quoteToken.approve(ProxyContract.address, amount, { from });

  const tx = await margin.deposit(
    openTx.id,
    amount,
    { from }
  );

  if (printGas) {
    console.log('\tMargin.deposit gas used: ' + tx.receipt.gasUsed);
  }

  const newBalance = await margin.getPositionBalance.call(openTx.id);

  expect(newBalance).to.be.bignumber.equal(initialBalance.plus(amount));

  expectLog(tx.logs[0], 'AdditionalCollateralDeposited', {
    marginId: openTx.id,
    amount: amount,
    depositor: from
  });

  return tx;
}
