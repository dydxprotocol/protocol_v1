const expect = require('chai').expect;
const BigNumber = require('bignumber.js');
const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require('TokenA');
const TokenProxy = artifacts.require('TokenProxy');
const { expectThrow } = require('../../helpers/ExpectHelper');
const {
  createOpenTx,
  issueTokensAndSetAllowances,
  callOpenPosition,
  callCancelLoanOffer,
  doOpenPosition,
  issueTokensAndSetAllowancesForClose,
  callClosePosition,
  issueForDirectClose,
  callClosePositionDirectly
} = require('../../helpers/MarginHelper');
const {
  createSignedV1SellOrder
} = require('../../helpers/ZeroExV1Helper');
const { issueAndSetAllowance } = require('../../helpers/TokenHelper');

const OperationState = {
  OPERATIONAL: 0,
  CLOSE_AND_CANCEL_LOAN_ONLY: 1,
  CLOSE_ONLY: 2,
  CLOSE_DIRECTLY_ONLY: 3,
  INVALID: 4,
};

describe('MarginAdmin', () => {
  describe('Constructor', () => {
    contract('Margin', accounts => {
      it('Sets OperationState to OPERATIONAL', async () => {
        const dydxMargin = await Margin.deployed();

        const [
          operationState,
          owner
        ] = await Promise.all([
          dydxMargin.operationState.call(),
          dydxMargin.owner.call()
        ]);

        expect(operationState.toNumber()).to.eq(OperationState.OPERATIONAL);
        expect(owner.toLowerCase()).to.eq(accounts[0].toLowerCase());
      })
    });
  });

  describe('#setOperationState', () => {
    contract('Margin', () => {
      it('Sets OperationState correctly', async () => {
        const dydxMargin = await Margin.deployed();

        await dydxMargin.setOperationState(OperationState.CLOSE_ONLY);
        await expectOperationState(dydxMargin, OperationState.CLOSE_ONLY);
      });
    });

    contract('Margin', () => {
      it('Does not allow invalid OperationStates', async () => {
        const dydxMargin = await Margin.deployed();
        await expectThrow(dydxMargin.setOperationState(OperationState.INVALID));
      });
    });

    contract('Margin', accounts => {
      it('Only allows owner to set', async () => {
        const dydxMargin = await Margin.deployed();

        await expectThrow(
          dydxMargin.setOperationState(OperationState.CLOSE_ONLY, { from: accounts[2] })
        );
        await expectOperationState(dydxMargin, OperationState.OPERATIONAL);
      });
    });

    contract('Margin', () => {
      it('Does nothing on set to same state', async () => {
        const dydxMargin = await Margin.deployed();

        await dydxMargin.setOperationState(OperationState.OPERATIONAL);
        await expectOperationState(dydxMargin, OperationState.OPERATIONAL);
      });
    });
  });

  describe('#onlyWhileOperational', () => {
    contract('Margin', accounts => {
      it('Only allows #openPosition while OPERATIONAL', async () => {
        const openTx = await createOpenTx(accounts);
        const dydxMargin = await Margin.deployed();

        await issueTokensAndSetAllowances(openTx);

        await dydxMargin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(callOpenPosition(dydxMargin, openTx));

        await dydxMargin.setOperationState(OperationState.OPERATIONAL);
        await callOpenPosition(dydxMargin, openTx);
      });
    });

    contract('Margin', accounts => {
      it('Only allows #cancelMarginCall while OPERATIONAL', async () => {
        const dydxMargin = await Margin.deployed();
        const openTx = await doOpenPosition(accounts);

        await dydxMargin.marginCall(
          openTx.id,
          new BigNumber(10),
          { from: openTx.loanOffering.payer }
        );

        await dydxMargin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(dydxMargin.cancelMarginCall(
          openTx.id,
          { from: openTx.loanOffering.payer }
        ));

        await dydxMargin.setOperationState(OperationState.OPERATIONAL);
        await dydxMargin.cancelMarginCall(
          openTx.id,
          { from: openTx.loanOffering.payer }
        );
      });
    });

    contract('Margin', accounts => {
      it('Allows #deposit while OPERATIONAL', async () => {
        const [dydxMargin, heldToken] = await Promise.all([
          Margin.deployed(),
          HeldToken.deployed()
        ]);
        const openTx = await doOpenPosition(accounts);
        const amount = new BigNumber(1000);

        await issueAndSetAllowance(
          heldToken,
          openTx.trader,
          amount,
          TokenProxy.address
        );

        await dydxMargin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(dydxMargin.depositCollateral(
          openTx.id,
          amount,
          { from: openTx.trader }
        ));

        await dydxMargin.setOperationState(OperationState.OPERATIONAL);
        await dydxMargin.depositCollateral(
          openTx.id,
          amount,
          { from: openTx.trader }
        );
      });
    });
  });

  describe('#cancelLoanStateControl', () => {
    const cancelAmount = new BigNumber(100000);

    async function test(accounts, state, shouldFail = false) {
      const openTx = await doOpenPosition(accounts);
      const dydxMargin = await Margin.deployed();
      await issueForDirectClose(openTx);

      await dydxMargin.setOperationState(state);
      if (shouldFail) {
        await expectThrow(
          callCancelLoanOffer(
            dydxMargin,
            openTx.loanOffering,
            cancelAmount
          )
        );
      } else {
        await callCancelLoanOffer(
          dydxMargin,
          openTx.loanOffering,
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
    const closeAmount = new BigNumber(100000);

    async function test(accounts, state, shouldFail = false) {
      const openTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedV1SellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

      await dydxMargin.setOperationState(state);
      if (shouldFail) {
        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, closeAmount));
      } else {
        await callClosePosition(dydxMargin, openTx, sellOrder, closeAmount);
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
    const closeAmount = new BigNumber(100000);
    async function test(accounts, state) {
      const openTx = await doOpenPosition(accounts);
      const dydxMargin = await Margin.deployed();
      await issueForDirectClose(openTx);

      await dydxMargin.setOperationState(state);
      await callClosePositionDirectly(dydxMargin, openTx, closeAmount);
    }

    contract('Margin', accounts => {
      it('Allows #closePositionDirectly while OPERATIONAL', async () => {
        await test(accounts, OperationState.OPERATIONAL);
      });
    });

    contract('Margin', accounts => {
      it('Allows #closePositionDirectly while CLOSE_AND_CANCEL_LOAN_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_AND_CANCEL_LOAN_ONLY);
      });
    });

    contract('Margin', accounts => {
      it('Allows #closePositionDirectly while CLOSE_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_ONLY);
      });
    });

    contract('Margin', accounts => {
      it('Allows #closePositionDirectly while CLOSE_DIRECTLY_ONLY', async () => {
        await test(accounts, OperationState.CLOSE_DIRECTLY_ONLY);
      });
    });
  });
});

async function expectOperationState(dydxMargin, state) {
  const operationState = await dydxMargin.operationState.call();
  expect(operationState.toNumber()).to.eq(state);
}
