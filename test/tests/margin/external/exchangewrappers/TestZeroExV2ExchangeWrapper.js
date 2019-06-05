const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ZeroExV2ExchangeWrapper = artifacts.require("ZeroExV2ExchangeWrapper");
const FeeToken = artifacts.require("TokenC");
const TestToken = artifacts.require("TestToken");
let { ZeroExExchangeV2, ZeroExProxyV2 } = require("../../../../contracts/ZeroExV2");

const { BIGNUMBERS, ADDRESSES } = require('../../../../helpers/Constants');
const { zeroExV2OrderToBytes } = require('../../../../helpers/BytesHelper');
const { getPartialAmount } = require('../../../../helpers/MathHelper');
const { issueAndSetAllowance } = require('../../../../helpers/TokenHelper');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const {
  createSignedV2SellOrder,
  signV2Order,
  getV2OrderHash,
} = require('../../../../helpers/ZeroExV2Helper');

const baseAmount = new BigNumber('1e18');

describe('ZeroExV2ExchangeWrapper', () => {
  describe('Constructor', () => {
    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('sets constants correctly', async () => {
        const {
          dydxMargin,
          exchangeWrapper,
          feeToken
        } = await setup(accounts);

        const [
          ZERO_EX_EXCHANGE,
          ZERO_EX_TOKEN_PROXY,
          ZRX,
          marginIsTrusted,
          randomIsTrusted,
          zrxProxyAllowance
        ] = await Promise.all([
          exchangeWrapper.ZERO_EX_EXCHANGE.call(),
          exchangeWrapper.ZERO_EX_TOKEN_PROXY.call(),
          exchangeWrapper.ZRX.call(),
          exchangeWrapper.TRUSTED_MSG_SENDER.call(dydxMargin),
          exchangeWrapper.TRUSTED_MSG_SENDER.call(accounts[0]),
          feeToken.allowance.call(exchangeWrapper.address, ZeroExProxyV2.address)
        ]);

        expect(marginIsTrusted).to.be.true;
        expect(randomIsTrusted).to.be.false;
        expect(ZERO_EX_EXCHANGE).to.eq(ZeroExExchangeV2.address);
        expect(ZERO_EX_TOKEN_PROXY).to.eq(ZeroExProxyV2.address);
        expect(ZRX).to.eq(FeeToken.address);
        expect(zrxProxyAllowance).to.be.bignumber.eq(BIGNUMBERS.MAX_UINT256);
      });
    });
  });

  describe('#getExchangeCost', () => {
    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('gives the correct maker token for a given order', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);
        const amount = new BigNumber(baseAmount.times(2));

        const requiredtakerAssetAmount = await exchangeWrapper.getExchangeCost.call(
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order)
        );

        const expected = getPartialAmount(
          order.takerAssetAmount,
          order.makerAssetAmount,
          amount,
          true
        );

        expect(requiredtakerAssetAmount).to.be.bignumber.eq(expected);
      });
    });
  });

  describe('#getMaxMakerAmount', () => {
    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('gives the correct maker token for a given order', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxProxy,
          dydxMargin
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);
        order.feeRecipientAddress = ADDRESSES.ZERO;
        order.signature = await signV2Order(order);

        // test for un-taken order
        const responseFull = await exchangeWrapper.getMaxMakerAmount.call(
          order.makerTokenAddress,
          order.takerTokenAddress,
          zeroExV2OrderToBytes(order)
        );
        expect(responseFull).to.be.bignumber.eq(order.makerAssetAmount);

        // fill half of order
        const amount = order.takerAssetAmount.div(2).floor();
        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
          { from: dydxMargin }
        );
        const exchange = await ZeroExExchangeV2.deployed();
        const filled = await exchange.filled.call(getV2OrderHash(order));
        expect(filled).to.be.bignumber.eq(amount);

        // test for partially-taken order
        const expectedAmount = order.makerAssetAmount.div(2).floor()
        const responsePart = await exchangeWrapper.getMaxMakerAmount.call(
          order.makerTokenAddress,
          order.takerTokenAddress,
          zeroExV2OrderToBytes(order)
        );
        expect(responsePart).to.be.bignumber.eq(expectedAmount);
      });
    });

    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('returns 0 for a non-fillable order', async () => {
        const {
          exchangeWrapper,
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);
        order.expirationTimeSeconds = new BigNumber(1);
        order.signature = await signV2Order(order);

        // test for partially-taken order
        const responsePart = await exchangeWrapper.getMaxMakerAmount.call(
          order.makerTokenAddress,
          order.takerTokenAddress,
          zeroExV2OrderToBytes(order)
        );
        expect(responsePart).to.be.bignumber.eq(0);
      });
    });
  });

  describe('#exchange', () => {
    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('successfully executes a trade', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        const startingBalances = await getBalances(
          order,
          exchangeWrapper,
          tradeOriginator,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
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

    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('successfully executes multiple trades', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);

        let amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        let startingBalances = await getBalances(
          order,
          exchangeWrapper,
          tradeOriginator,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
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
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
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
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
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

    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('fails if the exchangeWrapper is not given enough tokens', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount.minus(1));

        await expectThrow(exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
          { from: dydxMargin }
        ));
      });
    });

    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('fails if a fee is dictated by someone else', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        await expectThrow(exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
          { from: accounts[0] }
        ));
      });
    });

    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('fails if makerToken returned is zero', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);
        order.makerAssetAmount = new BigNumber(0);
        order.signature = await signV2Order(order);

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        await expectThrow(exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
          { from: dydxMargin }
        ));
      });
    });

    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('succeeds if zero taker fee for any msg.sender', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);
        order.takerFee = new BigNumber(0);
        order.signature = await signV2Order(order);

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        const startingBalances = await getBalances(
          order,
          exchangeWrapper,
          tradeOriginator,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order)
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

    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('fails if order is too small', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);

        const amount = new BigNumber(order.takerAssetAmount.plus(1));

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        await expectThrow(exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
          { from: dydxMargin }
        ));
      });
    });

    contract('ZeroExV2ExchangeWrapper', accounts => {
      it('fails if order has already been filled', async () => {
        const {
          exchangeWrapper,
          tradeOriginator,
          dydxMargin,
          dydxProxy
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts);

        const amount = new BigNumber(order.takerAssetAmount.times(2).div(3).floor());

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
          { from: dydxMargin }
        );

        await grantTokens(order, exchangeWrapper, tradeOriginator, amount);

        await expectThrow(exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2OrderToBytes(order),
          { from: dydxMargin }
        ));
      });
    });
  });
});

async function setup(accounts) {
  const dydxMargin = accounts[2];
  const dydxProxy = accounts[3];
  const tradeOriginator = accounts[1];

  const feeToken = await FeeToken.deployed();

  const exchangeWrapper = await ZeroExV2ExchangeWrapper.new(
    ZeroExExchangeV2.address,
    ZeroExProxyV2.address,
    feeToken.address,
    [dydxMargin]
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
      order.makerAddress,
      order.makerAssetAmount,
      ZeroExProxyV2.address
    ),

    // Taker Token
    takerToken.issueTo(exchangeWrapper.address, amount),

    // Maker Fee Token
    issueAndSetAllowance(
      feeToken,
      order.makerAddress,
      order.makerFee,
      ZeroExProxyV2.address
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
    makerToken.balanceOf.call(order.makerAddress),
    takerToken.balanceOf.call(order.makerAddress),
    feeToken.balanceOf.call(order.makerAddress),

    makerToken.balanceOf.call(exchangeWrapper.address),
    takerToken.balanceOf.call(exchangeWrapper.address),
    feeToken.balanceOf.call(exchangeWrapper.address),

    feeToken.balanceOf.call(order.feeRecipientAddress),

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
    order.takerAssetAmount,
    order.makerAssetAmount
  );
  const makerFee = getPartialAmount(
    amount,
    order.takerAssetAmount,
    order.makerFee
  );
  const takerFee = getPartialAmount(
    amount,
    order.takerAssetAmount,
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

  // Exchange Wrapper TokenProxy Allowance
  expect(exchangeWrapperProxyAllowance).to.be.bignumber.gte(tradedMakerToken);
}
