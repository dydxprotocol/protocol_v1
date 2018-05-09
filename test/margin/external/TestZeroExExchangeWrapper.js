/*global web3, artifacts, contract, describe, it, before*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ZeroExExchangeWrapper = artifacts.require("ZeroExExchangeWrapper");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const FeeToken = artifacts.require("TokenC");
const TestToken = artifacts.require("TestToken");

const { BIGNUMBERS } = require('../../helpers/Constants');
const { zeroExOrderToBytes } = require('../../helpers/BytesHelper');
const { createSignedSellOrder } = require('../../helpers/ZeroExHelper');
const { getPartialAmount } = require('../../helpers/MathHelper');
const { issueAndSetAllowance } = require('../../helpers/TokenHelper');

describe('ZeroExExchangeWrapper', () => {
  describe('Constructor', () => {
    contract('ZeroExExchangeWrapper', accounts => {
      it('sets constants correctly', async () => {
        const {
          dydxMargin,
          dydxProxy,
          exchangeWrapper,
          zrx
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
          zrx.allowance.call(exchangeWrapper.address, ZeroExProxy.address)
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
        const amount = new BigNumber(BIGNUMBERS.BASE_AMOUNT.times(2));

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
        const amount = new BigNumber(BIGNUMBERS.BASE_AMOUNT.times(2));

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
      it.only('successfully executes a trade', async () => {
        const {
          exchangeWrapper,
          taker,
          dydxMargin,
          zrx
        } = await setup(accounts);

        const order = await createSignedSellOrder(accounts);
        const [makerToken, takerToken] = await Promise.all([
          TestToken.at(order.makerTokenAddress),
          TestToken.at(order.takerTokenAddress),
        ])
        const amount = new BigNumber(BIGNUMBERS.BASE_AMOUNT.times(2));

        await grantTokens(order, exchangeWrapper, taker, makerToken, takerToken, zrx, amount);

        await exchangeWrapper.exchange(
          order.makerTokenAddress,
          order.takerTokenAddress,
          taker,
          amount,
          zeroExOrderToBytes(order),
          { from: dydxMargin }
        );
      });
    });
  });
});

async function setup(accounts) {
  const dydxMargin = accounts[6];
  const dydxProxy = accounts[7];
  const taker = accounts[5];

  const zrx = await FeeToken.deployed();

  const exchangeWrapper = await ZeroExExchangeWrapper.new(
    dydxMargin,
    dydxProxy,
    ZeroExExchange.address,
    ZeroExProxy.address,
    zrx.address
  );

  return {
    dydxMargin,
    dydxProxy,
    exchangeWrapper,
    zrx,
    taker,
  };
}


async function grantTokens(order, exchangeWrapper, taker, makerToken, takerToken, zrx, amount) {
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
      zrx,
      order.maker,
      order.makerFee,
      ZeroExProxy.address
    ),

    // Taker Fee Token
    issueAndSetAllowance(
      zrx,
      taker,
      order.takerFee,
      exchangeWrapper.address
    )
  ]);
}
