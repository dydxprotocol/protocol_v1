const chai = require('chai');
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const TestPositionOwner = artifacts.require('TestPositionOwner');
const { wait } = require('@digix/tempo')(web3);
const {
  issueTokensAndSetAllowancesForClose,
  doOpenPosition,
  callClosePosition,
  issueForDirectClose,
  callClosePositionDirectly
} = require('../../helpers/MarginHelper');
const {
  createSignedV1SellOrder
} = require('../../helpers/ZeroExV1Helper');
const {
  checkSuccess,
  checkSuccessCloseDirectly,
  getBalances
} = require('../../helpers/ClosePositionHelper');
const { ADDRESSES } = require('../../helpers/Constants');

const { expectThrow } = require('../../helpers/ExpectHelper');

describe('#closePosition', () => {
  contract('Margin', accounts => {
    it('Successfully closes a position in increments', async () => {
      const openTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedV1SellOrder(accounts),
        Margin.deployed()
      ]);

      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

      // Close half the position at a time
      const closeAmount = openTx.principal.div(2).floor();

      let [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, openTx, sellOrder),
        wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      let closeTx = await callClosePosition(dydxMargin, openTx, sellOrder, closeAmount);

      await checkSuccess(dydxMargin, openTx, closeTx, sellOrder, closeAmount, startingBalances);

      [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, openTx, sellOrder),
        wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      // Close the rest of the position
      closeTx = await callClosePosition(dydxMargin, openTx, sellOrder, closeAmount);

      await checkSuccess(dydxMargin, openTx, closeTx, sellOrder, closeAmount, startingBalances);
    });
  });

  contract('Margin', accounts => {
    it('Successfully closes a position when paying out in owedToken', async () => {
      const payoutInHeldToken = false;
      const openTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedV1SellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

      // Close half the position at a time
      const closeAmount = openTx.principal.div(2).floor();

      let [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, openTx, sellOrder),
        wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      let closeTx = await callClosePosition(
        dydxMargin,
        openTx,
        sellOrder,
        closeAmount,
        { payoutInHeldToken }
      );

      await checkSuccess(
        dydxMargin,
        openTx,
        closeTx,
        sellOrder,
        closeAmount,
        startingBalances,
        payoutInHeldToken
      );

      [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, openTx, sellOrder),
        wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      // Close the rest of the position
      closeTx = await callClosePosition(
        dydxMargin,
        openTx,
        sellOrder,
        closeAmount,
        { payoutInHeldToken }
      );

      await checkSuccess(
        dydxMargin,
        openTx,
        closeTx,
        sellOrder,
        closeAmount,
        startingBalances,
        payoutInHeldToken
      );
    });
  });

  contract('Margin', accounts => {
    it('only allows the position owner to close', async () => {
      const openTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedV1SellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);
      const closeAmount = openTx.principal.div(2).floor();

      await expectThrow(
        callClosePosition(
          dydxMargin,
          openTx,
          sellOrder,
          closeAmount,
          { from: accounts[6] }
        )
      );
    });
  });

  contract('Margin', accounts => {
    it('Only closes up to the current position principal', async () => {
      const openTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedV1SellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

      // Try to close twice the position principal
      const closeAmount = openTx.principal.times(2);

      const [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, openTx, sellOrder),
        wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      let closeTx = await callClosePosition(dydxMargin, openTx, sellOrder, closeAmount);

      await checkSuccess(
        dydxMargin,
        openTx,
        closeTx,
        sellOrder,
        openTx.principal,
        startingBalances
      );
    });
  });

  describe('#closeOnBehalfOf', () => {
    contract('Margin', accounts => {
      it('succeeds when position owner returns maximum value', async () => {
        const closeAmount = new BigNumber(20000);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);
        const owner = await TestPositionOwner.new(
          dydxMargin.address,
          ADDRESSES.ONE,
          ADDRESSES.ZERO,
          closeAmount
        );
        const openTx = await doOpenPosition(accounts, { positionOwner: owner.address });
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

        const [startingBalances,] = await Promise.all([
          getBalances(dydxMargin, openTx, sellOrder),
          wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
        ]);

        let closeTx = await callClosePosition(dydxMargin, openTx, sellOrder, closeAmount);

        await checkSuccess(
          dydxMargin,
          openTx,
          closeTx,
          sellOrder,
          closeAmount,
          startingBalances
        );
      });
    });

    contract('Margin', accounts => {
      it('restricts close amount to value returned', async () => {
        const closeAmount = new BigNumber(20000);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);
        const owner = await TestPositionOwner.new(
          dydxMargin.address,
          ADDRESSES.ONE,
          ADDRESSES.ZERO,
          closeAmount.div(2)
        );
        const openTx = await doOpenPosition(accounts, { positionOwner: owner.address });
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

        const [startingBalances,] = await Promise.all([
          getBalances(dydxMargin, openTx, sellOrder),
          wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
        ]);

        let closeTx = await callClosePosition(dydxMargin, openTx, sellOrder, closeAmount);

        await checkSuccess(
          dydxMargin,
          openTx,
          closeTx,
          sellOrder,
          closeAmount.div(2),
          startingBalances
        );
      });
    });

    contract('Margin', accounts => {
      it('fails if 0 is returned', async () => {
        const closeAmount = new BigNumber(20000);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);
        const owner = await TestPositionOwner.new(
          dydxMargin.address,
          ADDRESSES.ONE,
          ADDRESSES.ZERO,
          0
        );
        const openTx = await doOpenPosition(accounts, { positionOwner: owner.address });
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

        await wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber());

        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, closeAmount));
      });
    });

    contract('Margin', accounts => {
      it('fails if greater value is returned', async () => {
        const closeAmount = new BigNumber(20000);
        const [sellOrder, dydxMargin] = await Promise.all([
          createSignedV1SellOrder(accounts),
          Margin.deployed()
        ]);
        const owner = await TestPositionOwner.new(
          dydxMargin.address,
          ADDRESSES.ONE,
          ADDRESSES.ZERO,
          closeAmount.times(2)
        );
        const openTx = await doOpenPosition(accounts, { positionOwner: owner.address });
        await issueTokensAndSetAllowancesForClose(openTx, sellOrder);

        await wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber());

        await expectThrow(callClosePosition(dydxMargin, openTx, sellOrder, closeAmount));
      });
    });
  });
});

describe('#closePositionDirectly', () => {
  contract('Margin', accounts => {
    it('Successfully closes a position directly in increments', async () => {
      const openTx = await doOpenPosition(accounts);

      // Give the position owner enough owedToken to close
      await issueForDirectClose(openTx);

      const dydxMargin = await Margin.deployed();
      const closeAmount = openTx.principal.div(2).floor();

      let [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, openTx),
        wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      let closeTx = await callClosePositionDirectly(
        dydxMargin,
        openTx,
        closeAmount
      );

      await checkSuccessCloseDirectly(dydxMargin, openTx, closeTx, closeAmount, startingBalances);

      [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, openTx),
        wait(openTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      closeTx = await callClosePositionDirectly(
        dydxMargin,
        openTx,
        closeAmount
      );

      await checkSuccessCloseDirectly(dydxMargin, openTx, closeTx, closeAmount, startingBalances);
    });
  });
});
