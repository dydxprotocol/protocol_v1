/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
chai.use(require('chai-bignumber')());

const Margin = artifacts.require("Margin");
const { wait } = require('@digix/tempo')(web3);
const {
  issueTokensAndSetAllowancesForClose,
  doOpenPosition,
  callClosePosition,
  issueForDirectClose,
  callClosePositionDirectly
} = require('../helpers/MarginHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');
const {
  checkSuccess,
  checkSuccessCloseDirectly,
  getBalances
} = require('../helpers/ClosePositionHelper');

const { expectThrow } = require('../helpers/ExpectHelper');

describe('#closePosition', () => {
  contract('Margin', accounts => {
    it('Successfully closes a position in increments', async () => {
      const OpenTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);

      // Close half the position at a time
      const closeAmount = OpenTx.principal.div(2);

      let [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, OpenTx, sellOrder),
        wait(OpenTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      let closeTx = await callClosePosition(dydxMargin, OpenTx, sellOrder, closeAmount);

      await checkSuccess(dydxMargin, OpenTx, closeTx, sellOrder, closeAmount, startingBalances);

      [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, OpenTx, sellOrder),
        wait(OpenTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      // Close the rest of the position
      closeTx = await callClosePosition(dydxMargin, OpenTx, sellOrder, closeAmount);

      await checkSuccess(dydxMargin, OpenTx, closeTx, sellOrder, closeAmount, startingBalances);
    });
  });

  contract('Margin', accounts => {
    it('Successfully closes a position when paying out in owedToken', async () => {
      const payoutInHeldToken = false;
      const OpenTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);

      // Close half the position at a time
      const closeAmount = OpenTx.principal.div(2);

      let [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, OpenTx, sellOrder),
        wait(OpenTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      let closeTx = await callClosePosition(
        dydxMargin,
        OpenTx,
        sellOrder,
        closeAmount,
        { payoutInHeldToken }
      );

      await checkSuccess(
        dydxMargin,
        OpenTx,
        closeTx,
        sellOrder,
        closeAmount,
        startingBalances,
        payoutInHeldToken
      );

      [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, OpenTx, sellOrder),
        wait(OpenTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      // Close the rest of the position
      closeTx = await callClosePosition(
        dydxMargin,
        OpenTx,
        sellOrder,
        closeAmount,
        { payoutInHeldToken }
      );

      await checkSuccess(
        dydxMargin,
        OpenTx,
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
      const OpenTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);
      const closeAmount = OpenTx.principal.div(2);

      await expectThrow(
        callClosePosition(
          dydxMargin,
          OpenTx,
          sellOrder,
          closeAmount,
          { from: accounts[6] }
        )
      );
    });
  });

  contract('Margin', accounts => {
    it('Only closes up to the current position principal', async () => {
      const OpenTx = await doOpenPosition(accounts);
      const [sellOrder, dydxMargin] = await Promise.all([
        createSignedSellOrder(accounts),
        Margin.deployed()
      ]);
      await issueTokensAndSetAllowancesForClose(OpenTx, sellOrder);

      // Try to close twice the position principal
      const closeAmount = OpenTx.principal.times(2);

      const [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, OpenTx, sellOrder),
        wait(OpenTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      let closeTx = await callClosePosition(dydxMargin, OpenTx, sellOrder, closeAmount);

      await checkSuccess(
        dydxMargin,
        OpenTx,
        closeTx,
        sellOrder,
        OpenTx.principal,
        startingBalances
      );
    });
  });
});

describe('#closePositionDirectly', () => {
  contract('Margin', accounts => {
    it('Successfully closes a position directly in increments', async () => {
      const OpenTx = await doOpenPosition(accounts);

      // Give the position owner enough owedToken to close
      await issueForDirectClose(OpenTx);

      const dydxMargin = await Margin.deployed();
      const closeAmount = OpenTx.principal.div(2);

      let [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, OpenTx),
        wait(OpenTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      let closeTx = await callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        closeAmount
      );

      await checkSuccessCloseDirectly(dydxMargin, OpenTx, closeTx, closeAmount, startingBalances);

      [startingBalances,] = await Promise.all([
        getBalances(dydxMargin, OpenTx),
        wait(OpenTx.loanOffering.rates.interestPeriod.plus(1).toNumber()) // Wait for interest
      ]);

      closeTx = await callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        closeAmount
      );

      await checkSuccessCloseDirectly(dydxMargin, OpenTx, closeTx, closeAmount, startingBalances);
    });
  });
});
