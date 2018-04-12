/*global artifacts, contract, describe, it*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');
const Margin = artifacts.require("Margin");
const QuoteToken = artifacts.require('TokenA');
const ProxyContract = artifacts.require('Proxy');
const { expectAssertFailure, expectThrow } = require('../helpers/ExpectHelper');
const {
  createMarginTradeTx,
  issueTokensAndSetAllowancesFor,
  callOpenPosition,
  callCancelLoanOffer,
  doOpenPosition,
  issueTokensAndSetAllowancesForClose,
  callClosePosition,
  callApproveLoanOffering,
  issueForDirectClose,
  callClosePositionDirectly
} = require('../helpers/MarginHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');

const OperationState = {
  OPERATIONAL: 0,
  CLOSE_AND_CANCEL_LOAN_ONLY: 1,
  CLOSE_ONLY: 2,
  CLOSE_DIRECTLY_ONLY: 3,
};

describe('MarginAdmin', () => {
  describe('Constructor', () => {
    contract('Margin', accounts => {
      it('Sets OperationState to OPERATIONAL', async () => {
        const margin = await Margin.deployed();

        const [
          operationState,
          owner
        ] = await Promise.all([
          margin.operationState.call(),
          margin.owner.call()
        ]);

        expect(operationState.toNumber()).to.eq(OperationState.OPERATIONAL);
        expect(owner.toLowerCase()).to.eq(accounts[0].toLowerCase());
      })
    });
  });

  describe('#setOperationState', () => {
    contract('Margin', () => {
      it('Sets OperationState correctly', async () => {
        const margin = await Margin.deployed();

        await margin.setOperationState(OperationState.CLOSE_ONLY);
        await expectOperationState(margin, OperationState.CLOSE_ONLY);
      });
    });

    contract('Margin', () => {
      it('Does not allow invalid OperationStates', async () => {
        const margin = await Margin.deployed();

        await expectAssertFailure(margin.setOperationState(7));
        await expectOperationState(margin, OperationState.OPERATIONAL);
      });
    });

    contract('Margin', accounts => {
      it('Only allows owner to set', async () => {
        const margin = await Margin.deployed();

        await expectThrow(
          margin.setOperationState(OperationState.CLOSE_ONLY, { from: accounts[2] })
        );
        await expectOperationState(margin, OperationState.OPERATIONAL);
      });
    });

    contract('Margin', () => {
      it('Does nothing on set to same state', async () => {
        const margin = await Margin.deployed();

        await margin.setOperationState(OperationState.OPERATIONAL);
        await expectOperationState(margin, OperationState.OPERATIONAL);
      });
    });
  });

  describe('#onlyWhileOperational', () => {
    contract('Margin', accounts => {
      it('Only allows #openPosition while OPERATIONAL', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);
        const margin = await Margin.deployed();

        await issueTokensAndSetAllowancesFor(OpenPositionTx);

        await margin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow( callOpenPosition(margin, OpenPositionTx));

        await margin.setOperationState(OperationState.OPERATIONAL);
        await callOpenPosition(margin, OpenPositionTx);
      });
    });

    contract('Margin', accounts => {
      it('Only allows #cancelMarginCall while OPERATIONAL', async () => {
        const margin = await Margin.deployed();
        const OpenPositionTx = await doOpenPosition(accounts);

        await margin.marginCall(
          OpenPositionTx.id,
          new BigNumber(10),
          { from: OpenPositionTx.loanOffering.payer }
        );

        await margin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow( margin.cancelMarginCall(
          OpenPositionTx.id,
          { from: OpenPositionTx.loanOffering.payer }
        ));

        await margin.setOperationState(OperationState.OPERATIONAL);
        await margin.cancelMarginCall(
          OpenPositionTx.id,
          { from: OpenPositionTx.loanOffering.payer }
        );
      });
    });

    contract('Margin', accounts => {
      it('Allows #deposit while OPERATIONAL', async () => {
        const [margin, quoteToken] = await Promise.all([
          Margin.deployed(),
          QuoteToken.deployed()
        ]);
        const OpenPositionTx = await doOpenPosition(accounts);
        const amount = new BigNumber(1000);
        await quoteToken.issue(amount, { from: OpenPositionTx.trader });
        await quoteToken.approve(ProxyContract.address, amount, { from: OpenPositionTx.trader });

        await margin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow( margin.deposit(
          OpenPositionTx.id,
          amount,
          { from: OpenPositionTx.trader }
        ));

        await margin.setOperationState(OperationState.OPERATIONAL);
        await margin.deposit(
          OpenPositionTx.id,
          amount,
          { from: OpenPositionTx.trader }
        );
      });
    });

    contract('Margin', accounts => {
      it('Only allows #approveLoanOffering while OPERATIONAL', async () => {
        const OpenPositionTx = await createMarginTradeTx(accounts);
        const margin = await Margin.deployed();

        await issueTokensAndSetAllowancesFor(OpenPositionTx);

        await margin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow( callApproveLoanOffering(
          margin,
          OpenPositionTx.loanOffering
        ));

        await margin.setOperationState(OperationState.OPERATIONAL);
        await callApproveLoanOffering(
          margin,
          OpenPositionTx.loanOffering
        );
      });
    });
  });

  describe('#cancelLoanStateControl', () => {
    const cancelAmount = new BigNumber(100);

    async function test(accounts, state, shouldFail = false) {
      const OpenPositionTx = await doOpenPosition(accounts);
      const margin = await Margin.deployed();
      await issueForDirectClose(OpenPositionTx);

      await margin.setOperationState(state);
      if (shouldFail) {
        await expectThrow(
          callCancelLoanOffer(
            margin,
            OpenPositionTx.loanOffering,
            cancelAmount
          )
        );
      } else {
        await callCancelLoanOffer(
          margin,
          OpenPositionTx.loanOffering,
          cancelAmount
        );
      }
    }

    contract('Margin', accounts => {
      it('Allows #cancelLoanOffering while OPERATIONAL', async () => {
        await test(accounts, OperationState.OPERATIONAL);
      });
    });

    contract('Margin', accounts => {
      it('Allows #cancelLoanOffering while CLOSE_AND_CANCEL_LOAN_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_AND_CANCEL_LOAN_ONLY);
      });
    });

    contract('Margin', accounts => {
      it('Disallows #cancelLoanOffering while CLOSE_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_ONLY, true);
      });
    });

    contract('Margin', accounts => {
      it('Disallows #cancelLoanOffering while CLOSE_DIRECTLY_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_DIRECTLY_ONLY, true);
      });
    });
  });

  describe('#closePositionStateControl', () => {
    const closeAmount = new BigNumber(100);

    async function test(accounts, state, shouldFail = false) {
      const OpenPositionTx = await doOpenPosition(accounts);
      const [sellOrder, margin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenPositionTx, sellOrder);

      await margin.setOperationState(state);
      if (shouldFail) {
        await expectThrow( callClosePosition(margin, OpenPositionTx, sellOrder, closeAmount) );
      } else {
        await callClosePosition(margin, OpenPositionTx, sellOrder, closeAmount);
      }
    }

    contract('Margin', accounts => {
      it('Allows #closePosition while OPERATIONAL', async () => {
        await test(accounts, OperationState.OPERATIONAL);
      });
    });

    contract('Margin', accounts => {
      it('Allows #closePosition while CLOSE_AND_CANCEL_LOAN_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_AND_CANCEL_LOAN_ONLY);
      });
    });

    contract('Margin', accounts => {
      it('Allows #closePosition while CLOSE_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_ONLY);
      });
    });

    contract('Margin', accounts => {
      it('Disallows #closePosition while CLOSE_DIRECTLY_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_DIRECTLY_ONLY, true);
      });
    });
  });


  describe('#closePositionDirectlyStateControl', () => {
    const closeAmount = new BigNumber(100);
    async function test(accounts, state) {
      const OpenPositionTx = await doOpenPosition(accounts);
      const margin = await Margin.deployed();
      await issueForDirectClose(OpenPositionTx);

      await margin.setOperationState(state);
      await callClosePositionDirectly(margin, OpenPositionTx, closeAmount);
    }

    contract('Margin', accounts => {
      it('Allows #closePosition while OPERATIONAL', async () => {
        await test(accounts, OperationState.OPERATIONAL);
      });
    });

    contract('Margin', accounts => {
      it('Allows #closePosition while CLOSE_AND_CANCEL_LOAN_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_AND_CANCEL_LOAN_ONLY);
      });
    });

    contract('Margin', accounts => {
      it('Allows #closePosition while CLOSE_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_ONLY);
      });
    });

    contract('Margin', accounts => {
      it('Allows #closePosition while CLOSE_DIRECTLY_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_DIRECTLY_ONLY);
      });
    });
  });
});

async function expectOperationState(margin, state) {
  const operationState = await margin.operationState.call();
  expect(operationState.toNumber()).to.eq(state);
}
