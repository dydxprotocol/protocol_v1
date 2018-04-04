/*global artifacts, contract, describe, it*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');
const ShortSell = artifacts.require("ShortSell");
const QuoteToken = artifacts.require('TokenA');
const ProxyContract = artifacts.require('Proxy');
const { expectAssertFailure, expectThrow } = require('../helpers/ExpectHelper');
const {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  callCancelLoanOffer,
  doShort,
  issueTokensAndSetAllowancesForClose,
  callCloseShort,
  callApproveLoanOffering,
  issueForDirectClose,
  callCloseShortDirectly
} = require('../helpers/ShortSellHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');

const OperationState = {
  OPERATIONAL: 0,
  CLOSE_AND_CANCEL_LOAN_ONLY: 1,
  CLOSE_ONLY: 2,
  CLOSE_DIRECTLY_ONLY: 3,
};

describe('ShortSellAdmin', () => {
  describe('Constructor', () => {
    contract('ShortSell', accounts => {
      it('Sets OperationState to OPERATIONAL', async () => {
        const shortSell = await ShortSell.deployed();

        const [
          operationState,
          owner
        ] = await Promise.all([
          shortSell.operationState.call(),
          shortSell.owner.call()
        ]);

        expect(operationState.toNumber()).to.eq(OperationState.OPERATIONAL);
        expect(owner.toLowerCase()).to.eq(accounts[0].toLowerCase());
      })
    });
  });

  describe('#setOperationState', () => {
    contract('ShortSell', () => {
      it('Sets OperationState correctly', async () => {
        const shortSell = await ShortSell.deployed();

        await shortSell.setOperationState(OperationState.CLOSE_ONLY);
        await expectOperationState(shortSell, OperationState.CLOSE_ONLY);
      });
    });

    contract('ShortSell', () => {
      it('Does not allow invalid OperationStates', async () => {
        const shortSell = await ShortSell.deployed();

        await expectAssertFailure(() => shortSell.setOperationState(7));
        await expectOperationState(shortSell, OperationState.OPERATIONAL);
      });
    });

    contract('ShortSell', accounts => {
      it('Only allows owner to set', async () => {
        const shortSell = await ShortSell.deployed();

        await expectThrow(
          () => shortSell.setOperationState(OperationState.CLOSE_ONLY, { from: accounts[2] })
        );
        await expectOperationState(shortSell, OperationState.OPERATIONAL);
      });
    });

    contract('ShortSell', () => {
      it('Does nothing on set to same state', async () => {
        const shortSell = await ShortSell.deployed();

        await shortSell.setOperationState(OperationState.OPERATIONAL);
        await expectOperationState(shortSell, OperationState.OPERATIONAL);
      });
    });
  });

  describe('#onlyWhileOperational', () => {
    contract('ShortSell', accounts => {
      it('Only allows #short while OPERATIONAL', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);

        await shortSell.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(() => callShort(shortSell, shortTx));

        await shortSell.setOperationState(OperationState.OPERATIONAL);
        await callShort(shortSell, shortTx);
      });
    });

    contract('ShortSell', accounts => {
      it('Only allows #cancelLoanCall while OPERATIONAL', async () => {
        const shortSell = await ShortSell.deployed();
        const shortTx = await doShort(accounts);

        await shortSell.callInLoan(
          shortTx.id,
          new BigNumber(10),
          { from: shortTx.loanOffering.lender }
        );

        await shortSell.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(() => shortSell.cancelLoanCall(
          shortTx.id,
          { from: shortTx.loanOffering.lender }
        ));

        await shortSell.setOperationState(OperationState.OPERATIONAL);
        await shortSell.cancelLoanCall(
          shortTx.id,
          { from: shortTx.loanOffering.lender }
        );
      });
    });

    contract('ShortSell', accounts => {
      it('Allows #deposit while OPERATIONAL', async () => {
        const [shortSell, quoteToken] = await Promise.all([
          ShortSell.deployed(),
          QuoteToken.deployed()
        ]);
        const shortTx = await doShort(accounts);
        const amount = new BigNumber(1000);
        await quoteToken.issue(amount, { from: shortTx.seller });
        await quoteToken.approve(ProxyContract.address, amount, { from: shortTx.seller });

        await shortSell.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(() => shortSell.deposit(
          shortTx.id,
          amount,
          { from: shortTx.seller }
        ));

        await shortSell.setOperationState(OperationState.OPERATIONAL);
        await shortSell.deposit(
          shortTx.id,
          amount,
          { from: shortTx.seller }
        );
      });
    });

    contract('ShortSell', accounts => {
      it('Only allows #cancelLoanOffering while OPERATIONAL', async () => {
        const shortSell = await ShortSell.deployed();
        const shortTx = await createShortSellTx(accounts);
        const cancelAmount = new BigNumber(1000);

        await shortSell.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(() => callCancelLoanOffer(
          shortSell,
          shortTx.loanOffering,
          cancelAmount
        ));

        await shortSell.setOperationState(OperationState.OPERATIONAL);
        await callCancelLoanOffer(
          shortSell,
          shortTx.loanOffering,
          cancelAmount
        );
      });
    });

    contract('ShortSell', accounts => {
      it('Only allows #approveLoanOffering while OPERATIONAL', async () => {
        const shortTx = await createShortSellTx(accounts);
        const shortSell = await ShortSell.deployed();

        await issueTokensAndSetAllowancesForShort(shortTx);

        await shortSell.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(() => callApproveLoanOffering(
          shortSell,
          shortTx.loanOffering
        ));

        await shortSell.setOperationState(OperationState.OPERATIONAL);
        await callApproveLoanOffering(
          shortSell,
          shortTx.loanOffering
        );
      });
    });
  });

  describe('#closeShortStateControl', () => {
    const closeAmount = new BigNumber(100);
    async function test(accounts, state, shouldFail = false) {
      const shortTx = await doShort(accounts);
      const [sellOrder, shortSell] = await Promise.all([
        createSignedSellOrder(accounts),
        ShortSell.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(shortTx, sellOrder);

      await shortSell.setOperationState(state);
      if (shouldFail) {
        await expectThrow( () => callCloseShort(shortSell, shortTx, sellOrder, closeAmount) );
      } else {
        await callCloseShort(shortSell, shortTx, sellOrder, closeAmount);
      }
    }

    contract('ShortSell', accounts => {
      it('Allows #closeShort while OPERATIONAL', async () => {
        await test(accounts, OperationState.OPERATIONAL);
      });
    });

    contract('ShortSell', accounts => {
      it('Allows #closeShort while CLOSE_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_ONLY);
      });
    });

    contract('ShortSell', accounts => {
      it('Disallows #closeShort while CLOSE_DIRECTLY_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_DIRECTLY_ONLY, true);
      });
    });
  });


  describe('#closeShortDirectlyStateControl', () => {
    const closeAmount = new BigNumber(100);
    async function test(accounts, state) {
      const shortTx = await doShort(accounts);
      const shortSell = await ShortSell.deployed();
      await issueForDirectClose(shortTx);

      await shortSell.setOperationState(state);
      await callCloseShortDirectly(shortSell, shortTx, closeAmount);
    }

    contract('ShortSell', accounts => {
      it('Allows #closeShort while OPERATIONAL', async () => {
        await test(accounts, OperationState.OPERATIONAL);
      });
    });

    contract('ShortSell', accounts => {
      it('Allows #closeShort while CLOSE_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_ONLY);
      });
    });
  });
});

async function expectOperationState(shortSell, state) {
  const operationState = await shortSell.operationState.call();
  expect(operationState.toNumber()).to.eq(state);
}
