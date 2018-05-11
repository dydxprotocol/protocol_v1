/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ZeroExExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const FeeToken = artifacts.require("TokenC");
const TestToken = artifacts.require("TestToken");

const { BIGNUMBERS, ADDRESSES } = require('../../helpers/Constants');
const { zeroExOrderToBytes } = require('../../helpers/BytesHelper');
const { createSignedSellOrder, signOrder } = require('../../helpers/ZeroExHelper');
const { getPartialAmount } = require('../../helpers/MathHelper');
const { issueAndSetAllowance } = require('../../helpers/TokenHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');

const baseAmount = new BigNumber('1e18');

describe('ZeroExExchangeWrapper', () => {
  describe('Constructor', () => {
    contract('ZeroExExchangeWrapper', accounts => {
      it('sets constants correctly', async () => {
        const {
          dydxMargin,
          dydxProxy,
          exchangeWrapper,
          feeToken
        } = await setup(accounts);

        const [
          DYDX_PROXY,
          ZERO_EX_EXCHANGE,
          ZERO_EX_PROXY,
          ZRX,
          DYDX_MARGIN,
          zrxProxyAllowance
        ] = await Promise.all([
          exchangeWrapper.DYDX_PROXY.call(),
          exchangeWrapper.ZERO_EX_EXCHANGE.call(),
          exchangeWrapper.ZERO_EX_PROXY.call(),
          exchangeWrapper.ZRX.call(),
          exchangeWrapper.DYDX_MARGIN.call(),
          feeToken.allowance.call(exchangeWrapper.address, ZeroExProxy.address)
        ]);

        expect(DYDX_PROXY).to.eq(dydxProxy);
        expect(DYDX_MARGIN).to.eq(dydxMargin);
        expect(ZERO_EX_EXCHANGE).to.eq(ZeroExExchange.address);
        expect(ZERO_EX_PROXY).to.eq(ZeroExProxy.address);
        expect(ZRX).to.eq(FeeToken.address);
        expect(zrxProxyAllowance).to.be.bignumber.eq(BIGNUMBERS.ONES_255);
      });
    });
  });

  describe('#getTradeMakerTokenAmount', () => {
    contract('ZeroExExchangeWrapper', accounts => {
      it('gives the correct maker token for a given order', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);

        const order = await createSignedSellOrder(accounts);
        const amount = new BigNumber(baseAmount.times(2));

        const receivedMakerTokenAmount = await exchangeWrapper.getTradeMakerTokenAmount.call(
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExOrderToBytes(order)
        );

        const expected = getPartialAmount(
          amount,
          order.takerTokenAmount,
          order.makerTokenAmount
        );

        expect(receivedMakerTokenAmount).to.be.bignumber.eq(expected);
      });
    });
  });

  describe('#getTakerTokenPrice', () => {
    contract('ZeroExExchangeWrapper', accounts => {
      it('gives the correct maker token for a given order', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);

        const order = await createSignedSellOrder(accounts);
        const amount = new BigNumber(baseAmount.times(2));

        const requiredTakerTokenAmount = await exchangeWrapper.getTakerTokenPrice.call(
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExOrderToBytes(order)
        );

        const expected = getPartialAmount(
          order.takerTokenAmount,
          order.makerTokenAmount,
          amount,
          true
        );

        expect(requiredTakerTokenAmount).to.be.bignumber.eq(expected);
      });
    });
  });

  describe('#exchange', () => {
    contract('ZeroExExchangeWrapper', accounts => {
      it('successfully executes a trade', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedSellOrder(accounts);

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        const startingBalances = await getBalances(
          order,
          exchangeWrapper,
          tradeOriginator,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          order.makerTokenAddress,
          order.takerTokenAddress,
          tradeOriginator,
          amount,
          zeroExOrderToBytes(order),
          { from: dydxMargin }
        );

        await validateBalances(
          startingBalances,
          order,
          exchangeWrapper,
          tradeOriginator,
          amount,
          dydxProxy
        );
      });
    });

    contract('ZeroExExchangeWrapper', accounts => {
      it('successfully executes multiple trades', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedSellOrder(accounts);

        let amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        let startingBalances = await getBalances(
          order,
          exchangeWrapper,
          tradeOriginator,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          order.makerTokenAddress,
          order.takerTokenAddress,
          tradeOriginator,
          amount,
          zeroExOrderToBytes(order),
          { from: dydxMargin }
        );

        await validateBalances(
          startingBalances,
          order,
          exchangeWrapper,
          tradeOriginator,
          amount,
          dydxProxy
        );

        amount = new BigNumber(baseAmount.times(1.5));
        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
        startingBalances = await getBalances(
          order,
          exchangeWrapper,
          tradeOriginator,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          order.makerTokenAddress,
          order.takerTokenAddress,
          tradeOriginator,
          amount,
          zeroExOrderToBytes(order),
          { from: dydxMargin }
        );

        await validateBalances(
          startingBalances,
          order,
          exchangeWrapper,
          tradeOriginator,
          amount,
          dydxProxy
        );

        amount = new BigNumber(baseAmount.times(1.2));
        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
        startingBalances = await getBalances(
          order,
          exchangeWrapper,
          tradeOriginator,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          order.makerTokenAddress,
          order.takerTokenAddress,
          tradeOriginator,
          amount,
          zeroExOrderToBytes(order),
          { from: dydxMargin }
        );

        await validateBalances(
          startingBalances,
          order,
          exchangeWrapper,
          tradeOriginator,
          amount,
          dydxProxy
        );
      });
    });

    contract('ZeroExExchangeWrapper', accounts => {
      it('does not transfer taker fee when 0 feeRecipient', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedSellOrder(accounts);

        order.feeRecipient = ADDRESSES.ZERO;
        order.ecSignature = await signOrder(order);

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        const startingBalances = await getBalances(
          order,
          exchangeWrapper,
          tradeOriginator,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          order.makerTokenAddress,
          order.takerTokenAddress,
          tradeOriginator,
          amount,
          zeroExOrderToBytes(order),
          { from: dydxMargin }
        );

        await validateBalances(
          startingBalances,
          order,
          exchangeWrapper,
          tradeOriginator,
          amount,
          dydxProxy
        );
      });
    });

    contract('ZeroExExchangeWrapper', accounts => {
      it('fails if order is too small', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin
        } = await setup(accounts);

        const order = await createSignedSellOrder(accounts);

        const amount = new BigNumber(order.takerTokenAmount.plus(1));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        await expectThrow(exchangeWrapper.exchange(
          order.makerTokenAddress,
          order.takerTokenAddress,
          tradeOriginator,
          amount,
          zeroExOrderToBytes(order),
          { from: dydxMargin }
        ));
      });
    });

    contract('ZeroExExchangeWrapper', accounts => {
      it('fails if order has already been filled', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin
        } = await setup(accounts);

        const order = await createSignedSellOrder(accounts);

        const amount = new BigNumber(order.takerTokenAmount.times(2).div(3).floor());

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        await exchangeWrapper.exchange(
          order.makerTokenAddress,
          order.takerTokenAddress,
          tradeOriginator,
          amount,
          zeroExOrderToBytes(order),
          { from: dydxMargin }
        );

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        await expectThrow(exchangeWrapper.exchange(
          order.makerTokenAddress,
          order.takerTokenAddress,
          tradeOriginator,
          amount,
          zeroExOrderToBytes(order),
          { from: dydxMargin }
        ));
      });
    });

    describe('#exchangeForAmount', () => {
      contract('ZeroExExchangeWrapper', accounts => {
        it('successfully executes a trade for a specific amount', async () => {
          const {
            exchangeWrapper,
            tradeOriginator,
            dydxMargin,
            dydxProxy
          } = await setup(accounts);

          const order = await createSignedSellOrder(accounts);

          const desiredAmount = new BigNumber(baseAmount.times(2));
          const takerAmount = getPartialAmount(
            order.takerTokenAmount,
            order.makerTokenAmount,
            desiredAmount,
            true
          );

          await grantTokens(order, exchangeWrapper, tradeOriginator, takerAmount);

          const startingBalances = await getBalances(
            order,
            exchangeWrapper,
            tradeOriginator,
            dydxProxy
          );

          await exchangeWrapper.exchangeForAmount(
            order.makerTokenAddress,
            order.takerTokenAddress,
            tradeOriginator,
            desiredAmount,
            zeroExOrderToBytes(order),
            { from: dydxMargin }
          );

          await validateBalances(
            startingBalances,
            order,
            exchangeWrapper,
            tradeOriginator,
            takerAmount,
            dydxProxy
          );
        });
      });
    });
  });
});

async function setup(accounts) {
  const dydxMargin = accounts[2];
  const dydxProxy = accounts[3];
  const tradeOriginator = accounts[1];

  const feeToken = await FeeToken.deployed();

  const exchangeWrapper = await ZeroExExchangeWrapper.new(
    dydxMargin,
    dydxProxy,
    ZeroExExchange.address,
    ZeroExProxy.address,
    feeToken.address
  );

  return {
    dydxMargin,
    dydxProxy,
    exchangeWrapper,
    feeToken,
    tradeOriginator,
  };
}

async function grantTokens(order, exchangeWrapper, tradeOriginator, amount) {
  const [makerToken, takerToken, feeToken] = await Promise.all([
    TestToken.at(order.makerTokenAddress),
    TestToken.at(order.takerTokenAddress),
    FeeToken.deployed()
  ]);

  await Promise.all([
    // Maker Token
    issueAndSetAllowance(
      makerToken,
      order.maker,
      order.makerTokenAmount,
      ZeroExProxy.address
    ),

    // Taker Token
    takerToken.issueTo(exchangeWrapper.address, amount),

    // Maker Fee Token
    issueAndSetAllowance(
      feeToken,
      order.maker,
      order.makerFee,
      ZeroExProxy.address
    ),

    // Taker Fee Token
    issueAndSetAllowance(
      feeToken,
      tradeOriginator,
      order.takerFee,
      exchangeWrapper.address
    )
  ]);
}

async function getBalances(order, exchangeWrapper, tradeOriginator, dydxProxy) {
  const [makerToken, takerToken, feeToken] = await Promise.all([
    TestToken.at(order.makerTokenAddress),
    TestToken.at(order.takerTokenAddress),
    FeeToken.deployed()
  ]);

  const [
    makerMakerToken,
    makerTakerToken,
    makerFeeToken,

    exchangeWrapperMakerToken,
    exchangeWrapperTakerToken,
    exchangeWrapperFeeToken,

    feeRecipientFeeToken,

    tradeOriginatorFeeToken,

    exchangeWrapperProxyAllowance
  ] = await Promise.all([
    makerToken.balanceOf.call(order.maker),
    takerToken.balanceOf.call(order.maker),
    feeToken.balanceOf.call(order.maker),

    makerToken.balanceOf.call(exchangeWrapper.address),
    takerToken.balanceOf.call(exchangeWrapper.address),
    feeToken.balanceOf.call(exchangeWrapper.address),

    feeToken.balanceOf.call(order.feeRecipient),

    feeToken.balanceOf.call(tradeOriginator),

    makerToken.allowance.call(exchangeWrapper.address, dydxProxy)
  ]);

  return {
    makerMakerToken,
    makerTakerToken,
    makerFeeToken,

    exchangeWrapperMakerToken,
    exchangeWrapperTakerToken,
    exchangeWrapperFeeToken,

    feeRecipientFeeToken,

    tradeOriginatorFeeToken,

    exchangeWrapperProxyAllowance
  };
}

async function validateBalances(
  startingBalances,
  order,
  exchangeWrapper,
  tradeOriginator,
  amount,
  dydxProxy
) {
  const {
    makerMakerToken,
    makerTakerToken,
    makerFeeToken,

    exchangeWrapperMakerToken,
    exchangeWrapperTakerToken,
    exchangeWrapperFeeToken,

    feeRecipientFeeToken,

    tradeOriginatorFeeToken,

    exchangeWrapperProxyAllowance
  } = await getBalances(order, exchangeWrapper, tradeOriginator, dydxProxy);

  const tradedMakerToken = getPartialAmount(
    amount,
    order.takerTokenAmount,
    order.makerTokenAmount
  );
  const makerFee = order.feeRecipient === ADDRESSES.ZERO ? BIGNUMBERS.ZERO : getPartialAmount(
    amount,
    order.takerTokenAmount,
    order.makerFee
  );
  const takerFee = order.feeRecipient === ADDRESSES.ZERO ? BIGNUMBERS.ZERO : getPartialAmount(
    amount,
    order.takerTokenAmount,
    order.takerFee
  );

  // Maker Balances
  expect(makerMakerToken).to.be.bignumber.eq(
    startingBalances.makerMakerToken.minus(tradedMakerToken)
  );
  expect(makerTakerToken).to.be.bignumber.eq(
    startingBalances.makerTakerToken.plus(amount)
  );
  expect(makerFeeToken).to.be.bignumber.eq(
    startingBalances.makerFeeToken.minus(makerFee)
  );

  // Exchange Wrapper Balances
  expect(exchangeWrapperMakerToken).to.be.bignumber.eq(
    startingBalances.exchangeWrapperMakerToken.plus(tradedMakerToken)
  );
  expect(exchangeWrapperTakerToken).to.be.bignumber.eq(0);
  expect(exchangeWrapperFeeToken).to.be.bignumber.eq(0);

  // Fee Recipient Balance
  expect(feeRecipientFeeToken).to.be.bignumber.eq(
    startingBalances.feeRecipientFeeToken.plus(makerFee.plus(takerFee))
  );

  // Trade Originator Balance
  expect(tradeOriginatorFeeToken).to.be.bignumber.eq(
    startingBalances.tradeOriginatorFeeToken.minus(takerFee)
  );

  // Exchange Wrapper Proxy Allowance
  expect(exchangeWrapperProxyAllowance).to.be.bignumber.gte(tradedMakerToken);
}
