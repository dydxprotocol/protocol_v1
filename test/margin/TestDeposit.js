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
  doShort,
  doShortAndCall,
  getShort
} = require('../helpers/MarginHelper');

describe('#deposit', () => {
  contract('Margin', function(accounts) {
    it('deposits additional funds into the short position', async () => {

      const shortTx = await doShort(accounts);
      const amount = new BigNumber(1000);

      const tx = await doDeposit({
        from: shortTx.seller,
        shortTx,
        printGas: true,
        amount: amount
      });

      expectLog(tx.logs[0], 'AdditionalDeposit', {
        marginId: shortTx.id,
        amount: amount,
        depositor: shortTx.seller
      });
    });
  });

  contract('Margin', function(accounts) {
    it('doesnt allow anyone but short seller to deposit', async () => {
      const shortTx = await doShort(accounts);
      await expectThrow(
        doDeposit({
          from: accounts[9],
          shortTx,
        })
      );
    });
  });

  contract('Margin', function(accounts) {
    it('fails for invalid marginId', async () => {
      const shortTx = await doShort(accounts);

      await expectThrow(
        doDeposit({
          from: shortTx.seller,
          shortTx: { id: BYTES32.BAD_ID },
          amount: 0
        })
      );
    });
  });

  contract('Margin', function(accounts) {
    it('fails on zero-amount deposit', async () => {
      const shortTx = await doShort(accounts);

      await expectThrow(
        doDeposit({
          from: shortTx.seller,
          shortTx,
          amount: 0
        })
      );
    });
  });

  contract('Margin', function(accounts) {
    it('allows deposit in increments', async () => {
      const dydxMargin = await Margin.deployed();
      const { shortTx } = await doShortAndCall(accounts);

      let { requiredDeposit } = await getShort(dydxMargin, shortTx.id);

      await doDeposit({
        from: shortTx.seller,
        shortTx,
        amount: requiredDeposit.minus(5)
      });

      let short = await getShort(dydxMargin, shortTx.id);
      requiredDeposit = short.requiredDeposit;
      let callTimestamp = short.callTimestamp;
      expect(requiredDeposit).to.be.bignumber.eq(5);
      expect(callTimestamp).to.be.bignumber.gt(new BigNumber(0));

      const amount2 = 5;
      const tx2 = await doDeposit({
        from: shortTx.seller,
        shortTx,
        amount: amount2
      });

      expectLog(tx2.logs[1], 'LoanCallCanceled', {
        marginId: shortTx.id,
        lender: shortTx.loanOffering.owner,
        shortSeller: shortTx.seller,
        depositAmount: amount2
      });

      short = await getShort(dydxMargin, shortTx.id);
      requiredDeposit = short.requiredDeposit;
      callTimestamp = short.callTimestamp;
      expect(requiredDeposit).to.be.bignumber.eq(0);
      expect(callTimestamp).to.be.bignumber.eq(0);
    });
  });
});

async function doDeposit({
  from,
  shortTx,
  printGas = false,
  amount = new BigNumber(1000)
}) {
  const [dydxMargin, quoteToken] = await Promise.all([
    Margin.deployed(),
    QuoteToken.deployed()
  ]);

  const initialBalance = await dydxMargin.getShortBalance.call(shortTx.id);
  await quoteToken.issue(amount, { from });
  await quoteToken.approve(ProxyContract.address, amount, { from });

  const tx = await dydxMargin.deposit(
    shortTx.id,
    amount,
    { from }
  );

  if (printGas) {
    console.log('\tMargin.deposit gas used: ' + tx.receipt.gasUsed);
  }

  const newBalance = await dydxMargin.getShortBalance.call(shortTx.id);

  expect(newBalance).to.be.bignumber.equal(initialBalance.plus(amount));

  expectLog(tx.logs[0], 'AdditionalDeposit', {
    marginId: shortTx.id,
    amount: amount,
    depositor: from
  });

  return tx;
}
