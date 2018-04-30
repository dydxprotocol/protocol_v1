/*global artifacts, contract, describe, it*/

const expect = require('chai').expect;
const BigNumber = require('bignumber.js');
const Margin = artifacts.require("Margin");
const HeldToken = artifacts.require('TokenA');
const ProxyContract = artifacts.require('Proxy');
const { expectAssertFailure, expectThrow } = require('../helpers/ExpectHelper');
const {
  createOpenTx,
  issueTokensAndSetAllowances,
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

        await expectAssertFailure(dydxMargin.setOperationState(7));
        await expectOperationState(dydxMargin, OperationState.OPERATIONAL);
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
        const OpenTx = await createOpenTx(accounts);
        const dydxMargin = await Margin.deployed();

        await issueTokensAndSetAllowances(OpenTx);

        await dydxMargin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(callOpenPosition(dydxMargin, OpenTx));

        await dydxMargin.setOperationState(OperationState.OPERATIONAL);
        await callOpenPosition(dydxMargin, OpenTx);
      });
    });

    contract('Margin', accounts => {
      it('Only allows #cancelMarginCall while OPERATIONAL', async () => {
        const dydxMargin = await Margin.deployed();
        const OpenTx = await doOpenPosition(accounts);

        await dydxMargin.marginCall(
          OpenTx.id,
          new BigNumber(10),
          { from: OpenTx.loanOffering.payer }
        );

        await dydxMargin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(dydxMargin.cancelMarginCall(
          OpenTx.id,
          { from: OpenTx.loanOffering.payer }
        ));

        await dydxMargin.setOperationState(OperationState.OPERATIONAL);
        await dydxMargin.cancelMarginCall(
          OpenTx.id,
          { from: OpenTx.loanOffering.payer }
        );
      });
    });

    contract('Margin', accounts => {
      it('Allows #deposit while OPERATIONAL', async () => {
        const [dydxMargin, heldToken] = await Promise.all([
          Margin.deployed(),
          HeldToken.deployed()
        ]);
        const OpenTx = await doOpenPosition(accounts);
        const amount = new BigNumber(1000);
        await heldToken.issue(amount, { from: OpenTx.trader });
        await heldToken.approve(ProxyContract.address, amount, { from: OpenTx.trader });

        await dydxMargin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(dydxMargin.depositCollateral(
          OpenTx.id,
          amount,
          { from: OpenTx.trader }
        ));

        await dydxMargin.setOperationState(OperationState.OPERATIONAL);
        await dydxMargin.depositCollateral(
          OpenTx.id,
          amount,
          { from: OpenTx.trader }
        );
      });
    });

    contract('Margin', accounts => {
      it('Only allows #approveLoanOffering while OPERATIONAL', async () => {
        const OpenTx = await createOpenTx(accounts);
        const dydxMargin = await Margin.deployed();

        await issueTokensAndSetAllowances(OpenTx);

        await dydxMargin.setOperationState(OperationState.CLOSE_ONLY);
        await expectThrow(callApproveLoanOffering(
          dydxMargin,
          OpenTx.loanOffering,
          OpenTx.loanOffering.signer
        ));

        await dydxMargin.setOperationState(OperationState.OPERATIONAL);
        await callApproveLoanOffering(
          dydxMargin,
          OpenTx.loanOffering,
          OpenTx.loanOffering.signer
        );
      });
    });
  });

  describe('#cancelLoanStateControl', () => {
    const cancelAmount = new BigNumber(100000);

    async function test(accounts, state, shouldFail = false) {
      const OpenTx = await doOpenPosition(accounts);
      const dydxMargin = await Margin.deployed();
      await issueForDirectClose(OpenTx);

      await dydxMargin.setOperationState(state);
      if (shouldFail) {
        await expectThrow(
          callCancelLoanOffer(
            dydxMargin,
            OpenTx.loanOffering,
            cancelAmount
          )
        );
      } else {
        await callCancelLoanOffer(
          dydxMargin,
          OpenTx.loanOffering,
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
      const OpenTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);

      await dydxMargin.setOperationState(state);
      if (shouldFail) {
        await expectThrow(callClosePosition(dydxMargin, OpenTx, sellOrder, closeAmount));
      } else {
        await callClosePosition(dydxMargin, OpenTx, sellOrder, closeAmount);
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
      const OpenTx = await doOpenPosition(accounts);
      const dydxMargin = await Margin.deployed();
      await issueForDirectClose(OpenTx);

      await dydxMargin.setOperationState(state);
      await callClosePositionDirectly(dydxMargin, OpenTx, closeAmount);
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

async function expectOperationState(dydxMargin, state) {
  const operationState = await dydxMargin.operationState.call();
  expect(operationState.toNumber()).to.eq(state);
}
