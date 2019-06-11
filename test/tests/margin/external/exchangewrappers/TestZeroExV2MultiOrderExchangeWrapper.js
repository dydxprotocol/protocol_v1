const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ZeroExV2MultiOrderExchangeWrapper = artifacts.require("ZeroExV2MultiOrderExchangeWrapper");
const TestToken = artifacts.require("TestToken");
const OwedToken = artifacts.require("TokenB");
let { ZeroExExchangeV2, ZeroExProxyV2 } = require("../../../../contracts/ZeroExV2");

const { zeroExV2MultiOrdersToBytes } = require('../../../../helpers/BytesHelper');
const { getPartialAmount } = require('../../../../helpers/MathHelper');
const { issueAndSetAllowance } = require('../../../../helpers/TokenHelper');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const {
  createSignedV2SellOrder,
  signV2Order,
} = require('../../../../helpers/ZeroExV2Helper');
const { toBytes32 } = require('../../../../helpers/BytesHelper');
const { BIGNUMBERS } = require('../../../../helpers/Constants');

const baseAmount = new BigNumber('1e18');

describe('ZeroExV2MultiOrderExchangeWrapper', () => {
  describe('Constructor', () => {
    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('sets constants correctly', async () => {
        const {
          exchangeWrapper,
        } = await setup(accounts);

        const [
          ZERO_EX_EXCHANGE,
          ZERO_EX_TOKEN_PROXY,
        ] = await Promise.all([
          exchangeWrapper.ZERO_EX_EXCHANGE.call(),
          exchangeWrapper.ZERO_EX_TOKEN_PROXY.call(),
        ]);

        expect(ZERO_EX_EXCHANGE).to.eq(ZeroExExchangeV2.address);
        expect(ZERO_EX_TOKEN_PROXY).to.eq(ZeroExProxyV2.address);
      });
    });
  });

  describe('#getExchangeCost', () => {
    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('fails for not-large-enough orders', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts, { fees: false });

        await expectThrow(exchangeWrapper.getExchangeCost.call(
          order.makerTokenAddress,
          order.takerTokenAddress,
          order.makerAssetAmount.plus(1),
          zeroExV2MultiOrdersToBytes([order])
        ));
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('gives the correct maker token for a given order', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts, { fees: false });
        const amount = new BigNumber(baseAmount.times(2));

        const requiredTakerAssetAmount = await exchangeWrapper.getExchangeCost.call(
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order])
        );

        const expected = getPartialAmount(
          order.takerAssetAmount,
          order.makerAssetAmount,
          amount,
          true
        );

        expect(requiredTakerAssetAmount).to.be.bignumber.eq(expected);
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('succeeds for two orders (taking the first order)', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, { fees: false });
        const order2 = await createSignedV2SellOrder(accounts, {
          fees: false,
          makerAssetMultiplier: '5.89273',
          takerAssetMultiplier: '16.92374',
        });
        const amount = new BigNumber(baseAmount.times(2));

        const requiredTakerAssetAmount = await exchangeWrapper.getExchangeCost.call(
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order1, order2])
        );

        const expected = getPartialAmount(
          order1.takerAssetAmount,
          order1.makerAssetAmount,
          amount,
          true
        );

        expect(requiredTakerAssetAmount).to.be.bignumber.eq(expected);
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('succeeds for two orders (taking both orders)', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, { fees: false });
        const order2 = await createSignedV2SellOrder(accounts, {
          fees: false,
          makerAssetMultiplier: '5.89273',
          takerAssetMultiplier: '16.92374',
        });
        const amount = order1.makerAssetAmount.plus(order2.makerAssetAmount);

        const requiredTakerAssetAmount = await exchangeWrapper.getExchangeCost.call(
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order1, order2])
        );

        const expected = order1.takerAssetAmount.plus(order2.takerAssetAmount);

        expect(requiredTakerAssetAmount).to.be.bignumber.eq(expected);
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('skips orders where the maker has not-enough tokens', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, {
          makerAddress: accounts[9],
          fees: false,
        });
        const order2 = await createSignedV2SellOrder(accounts, {
          fees: false,
        });
        const amount = order1.makerAssetAmount;
        const requiredTakerAssetAmount = await exchangeWrapper.getExchangeCost.call(
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order1, order2])
        );
        expect(requiredTakerAssetAmount).to.be.bignumber.eq(order2.takerAssetAmount);
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('skips order where the maker has enough tokens for the first order', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, {
          makerAddress: accounts[9],
          fees: false,
          salt: 1,
        });
        const order2 = await createSignedV2SellOrder(accounts, {
          makerAddress: accounts[9],
          fees: false,
          salt: 2,
        });
        const order3 = await createSignedV2SellOrder(accounts, {
          fees: false,
          takerAssetMultiplier: '21.123475',
        });

        const makerToken = await OwedToken.deployed();
        await issueAndSetAllowance(
          makerToken,
          order1.makerAddress,
          order1.makerAssetAmount.times(1.5),
          ZeroExProxyV2.address
        );

        const amount = order1.makerAssetAmount.plus(order3.makerAssetAmount);
        const requiredTakerAssetAmount = await exchangeWrapper.getExchangeCost.call(
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order1, order2, order3]),
        );
        const expectedTakerAssetAmount = order1.takerAssetAmount.plus(order3.takerAssetAmount);
        expect(requiredTakerAssetAmount).to.be.bignumber.eq(expectedTakerAssetAmount);
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('skips order where the maker has enough tokens for the second order', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, {
          makerAddress: accounts[9],
          fees: false,
          salt: 1,
          makerAssetMultiplier: '20',
        });
        const order2 = await createSignedV2SellOrder(accounts, {
          makerAddress: accounts[9],
          fees: false,
          salt: 2,
          makerAssetMultiplier: '10',
        });
        const order3 = await createSignedV2SellOrder(accounts, {
          fees: false,
          takerAssetMultiplier: '21.123475',
        });

        const makerToken = await OwedToken.deployed();
        await issueAndSetAllowance(
          makerToken,
          order2.makerAddress,
          order2.makerAssetAmount.times(1.5),
          ZeroExProxyV2.address
        );

        const amount = order2.makerAssetAmount.plus(order3.makerAssetAmount);
        const requiredTakerAssetAmount = await exchangeWrapper.getExchangeCost.call(
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order1, order2, order3]),
        );
        const expectedTakerAssetAmount = order2.takerAssetAmount.plus(order3.takerAssetAmount);
        expect(requiredTakerAssetAmount).to.be.bignumber.eq(expectedTakerAssetAmount);
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('fails when getting cost for too-large an amount', async () => {
        const {
          exchangeWrapper,
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, {
          fees: false,
          salt: '1',
        });
        const order2 = await createSignedV2SellOrder(accounts, {
          fees: false,
          salt: '2',
        });
        const amount = order1.makerAssetAmount.plus(order2.makerAssetAmount).plus(1);

        await expectThrow(exchangeWrapper.getExchangeCost.call(
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order1, order2]),
        ));
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('succeeds for an expired and partially-filled order', async () => {
        const {
          dydxProxy,
          tradeOriginator,
          exchangeWrapper,
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, {
          fees: false,
          expirationTimeSeconds: '1',
        });
        const order2 = await createSignedV2SellOrder(accounts, {
          fees: false,
        });
        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order1, exchangeWrapper, amount);

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order2])
        );

        const requiredTakerAssetAmount = await exchangeWrapper.getExchangeCost.call(
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order1, order2])
        );

        const expected = getPartialAmount(
          order2.takerAssetAmount,
          order2.makerAssetAmount,
          amount,
          true
        );

        expect(requiredTakerAssetAmount).to.be.bignumber.eq(expected);
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('succeeds for multiple orders of varying state', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, {
          fees: false,
        });
        const order2 = await createSignedV2SellOrder(accounts, {
          fees: false,
          expirationTimeSeconds: '1',
        });
        const order3 = await createSignedV2SellOrder(accounts, {
          fees: false,
          makerAssetMultiplier: '5.89273',
          takerAssetMultiplier: '16.92374',
        });

        // partially take order 1
        const amount1 = new BigNumber(baseAmount.times(2));
        await grantTokens(order1, exchangeWrapper, amount1);
        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount1,
          zeroExV2MultiOrdersToBytes([order1, order2, order3]),
        );

        const remainingMakerAmount = getPartialAmount(
          order1.takerAssetAmount.minus(amount1),
          order1.takerAssetAmount,
          order1.makerAssetAmount,
        ).plus(order3.makerAssetAmount);

        const cost = await exchangeWrapper.getExchangeCost.call(
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          remainingMakerAmount,
          zeroExV2MultiOrdersToBytes([order1, order2, order3]),
        );

        const amount2 = order1.takerAssetAmount.plus(order3.takerAssetAmount).minus(amount1);
        expect(cost).to.be.bignumber.equal(amount2);
      });
    });
  });

  describe('#exchange', () => {
    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('successfully executes a trade', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts, { fees: false });

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, amount);

        const startingBalances = await getBalances(
          order,
          exchangeWrapper,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order]),
        );

        await validateBalances(
          startingBalances,
          order,
          exchangeWrapper,
          amount,
          dydxProxy
        );
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('successfully executes multiple trades', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts, { fees: false });

        let amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, amount);

        let startingBalances = await getBalances(
          order,
          exchangeWrapper,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order]),
        );

        await validateBalances(
          startingBalances,
          order,
          exchangeWrapper,
          amount,
          dydxProxy
        );

        amount = new BigNumber(baseAmount.times(1.5));
        await grantTokens(order, exchangeWrapper, amount);
        startingBalances = await getBalances(
          order,
          exchangeWrapper,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order]),
        );

        await validateBalances(
          startingBalances,
          order,
          exchangeWrapper,
          amount,
          dydxProxy
        );

        amount = new BigNumber(baseAmount.times(1.2));
        await grantTokens(order, exchangeWrapper, amount);
        startingBalances = await getBalances(
          order,
          exchangeWrapper,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order]),
        );

        await validateBalances(
          startingBalances,
          order,
          exchangeWrapper,
          amount,
          dydxProxy
        );
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('succeeds for two orders (taking the first order)', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, { fees: false });
        const order2 = await createSignedV2SellOrder(accounts, {
          fees: false,
          makerAssetMultiplier: '5.89273',
          takerAssetMultiplier: '16.92374',
        });

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order1, exchangeWrapper, amount);

        const startingBalances = await getBalances(
          order1,
          exchangeWrapper,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order1, order2]),
        );

        await validateBalances(
          startingBalances,
          order1,
          exchangeWrapper,
          amount,
          dydxProxy
        );
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('succeeds for two orders (taking both orders)', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, {
          fees: false,
        });
        const order2 = await createSignedV2SellOrder(accounts, {
          fees: false,
          makerAssetMultiplier: '5.89273',
          takerAssetMultiplier: '16.92374',
        });

        const amount = order1.takerAssetAmount;

        await grantTokens(order1, exchangeWrapper, amount);

        const startingBalances = await getBalances(
          order1,
          exchangeWrapper,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order1, order2], new BigNumber(4)),
        );

        await validateBalances(
          startingBalances,
          order1,
          exchangeWrapper,
          amount,
          dydxProxy
        );
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('succeeds for multiple orders of varying state', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, {
          fees: false,
        });
        const order2 = await createSignedV2SellOrder(accounts, {
          fees: false,
          expirationTimeSeconds: '1',
        });
        const order3 = await createSignedV2SellOrder(accounts, {
          fees: false,
          makerAssetMultiplier: '5.89273',
          takerAssetMultiplier: '16.92374',
        });

        // partially take order 1
        const amount1 = new BigNumber(baseAmount.times(2));
        await grantTokens(order1, exchangeWrapper, amount1);
        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount1,
          zeroExV2MultiOrdersToBytes([order1, order2, order3]),
        );

        const amount2 = order1.takerAssetAmount.plus(order3.takerAssetAmount).minus(amount1);
        await grantTokens(order1, exchangeWrapper, amount2);

        const startingBalances = await getBalances(
          order1,
          exchangeWrapper,
          dydxProxy
        );

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order1.makerTokenAddress,
          order1.takerTokenAddress,
          amount2,
          zeroExV2MultiOrdersToBytes([order1, order2, order3]),
        );

        await validateBalances(
          startingBalances,
          order1,
          exchangeWrapper,
          amount2,
          dydxProxy,
          '12818323521604691757',
        );
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('fails for max-price-too-low', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order1 = await createSignedV2SellOrder(accounts, {
          fees: false,
        });
        const order2 = await createSignedV2SellOrder(accounts, {
          fees: false,
          makerAssetMultiplier: '5.89273',
          takerAssetMultiplier: '16.92374',
        });

        const amount = order1.takerAssetAmount;

        await grantTokens(order1, exchangeWrapper, amount);

        await expectThrow(
          exchangeWrapper.exchange(
            tradeOriginator,
            dydxProxy,
            order1.makerTokenAddress,
            order1.takerTokenAddress,
            amount,
            zeroExV2MultiOrdersToBytes([order1, order2], new BigNumber('0.0001')),
          ),
        );
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('fails for zero orders', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts, { fees: false });

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, amount);

        await expectThrow(
          exchangeWrapper.exchange(
            tradeOriginator,
            dydxProxy,
            order.makerTokenAddress,
            order.takerTokenAddress,
            amount,
            zeroExV2MultiOrdersToBytes([]),
          ),
        );
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('fails for price > 128 bits', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts, { fees: false });

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, amount);

        const orderBytes = zeroExV2MultiOrdersToBytes([order]);
        const priceBytes1 = priceToBytes("1e10", "1e40");
        const priceBytes2 = priceToBytes("1e40", "1e10");
        const finalBytes1 = priceBytes1 + orderBytes.slice(priceBytes1.length);
        const finalBytes2 = priceBytes2 + orderBytes.slice(priceBytes2.length);

        await expectThrow(
          exchangeWrapper.exchange(
            tradeOriginator,
            dydxProxy,
            order.makerTokenAddress,
            order.takerTokenAddress,
            amount,
            finalBytes1,
          ),
        );

        await expectThrow(
          exchangeWrapper.exchange(
            tradeOriginator,
            dydxProxy,
            order.makerTokenAddress,
            order.takerTokenAddress,
            amount,
            finalBytes2,
          ),
        );
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('fails if the exchangeWrapper is not given enough tokens', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts, { fees: false });

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, amount.minus(1));

        await expectThrow(exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order]),
        ));
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('fails if makerToken returned is zero', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts, { fees: false });
        order.makerAssetAmount = new BigNumber(0);
        order.signature = await signV2Order(order);

        const amount = new BigNumber(baseAmount.times(2));

        await grantTokens(order, exchangeWrapper, amount);

        await expectThrow(exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order]),
        ));
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('fails if order is too small', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts, { fees: false });

        const amount = new BigNumber(order.takerAssetAmount.plus(1));

        await grantTokens(order, exchangeWrapper, amount);

        await expectThrow(exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order]),
        ));
      });
    });

    contract('ZeroExV2MultiOrderExchangeWrapper', accounts => {
      it('fails if order has already been filled', async () => {
        const {
          exchangeWrapper,
          dydxProxy,
          tradeOriginator,
        } = await setup(accounts);

        const order = await createSignedV2SellOrder(accounts, { fees: false });

        const amount = new BigNumber(order.takerAssetAmount.times(2).div(3).floor());

        await grantTokens(order, exchangeWrapper, amount);

        await exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order]),
        );

        await grantTokens(order, exchangeWrapper, amount);

        await expectThrow(exchangeWrapper.exchange(
          tradeOriginator,
          dydxProxy,
          order.makerTokenAddress,
          order.takerTokenAddress,
          amount,
          zeroExV2MultiOrdersToBytes([order]),
        ));
      });
    });
  });
});

// ============ Helper Functions ============

function priceToBytes(num, den) {
  return web3Instance.utils.bytesToHex([]
    .concat(toBytes32(new BigNumber(num)))
    .concat(toBytes32(new BigNumber(den)))
  );
}

async function setup(accounts) {
  const dydxProxy = accounts[3];
  const tradeOriginator = accounts[2];
  const makerAddress = accounts[5];
  const makerToken = await OwedToken.deployed();
  await issueAndSetAllowance(
    makerToken,
    makerAddress,
    BIGNUMBERS.MAX_UINT128,
    ZeroExProxyV2.address
  );

  const exchangeWrapper = await ZeroExV2MultiOrderExchangeWrapper.new(
    ZeroExExchangeV2.address,
    ZeroExProxyV2.address,
  );

  return {
    dydxProxy,
    tradeOriginator,
    exchangeWrapper,
  };
}

async function grantTokens(order, exchangeWrapper, amount) {
  const [makerToken, takerToken] = await Promise.all([
    TestToken.at(order.makerTokenAddress),
    TestToken.at(order.takerTokenAddress),
  ]);

  await Promise.all([
    // Maker Token
    issueAndSetAllowance(
      makerToken,
      order.makerAddress,
      order.makerAssetAmount.times(10),
      ZeroExProxyV2.address
    ),

    // Taker Token
    takerToken.issueTo(exchangeWrapper.address, amount),
  ]);
}

async function getBalances(order, exchangeWrapper, dydxProxy) {
  const [makerToken, takerToken] = await Promise.all([
    TestToken.at(order.makerTokenAddress),
    TestToken.at(order.takerTokenAddress),
  ]);

  const [
    makerMakerToken,
    makerTakerToken,
    exchangeWrapperMakerToken,
    exchangeWrapperTakerToken,
    exchangeWrapperProxyAllowance
  ] = await Promise.all([
    makerToken.balanceOf.call(order.makerAddress),
    takerToken.balanceOf.call(order.makerAddress),
    makerToken.balanceOf.call(exchangeWrapper.address),
    takerToken.balanceOf.call(exchangeWrapper.address),
    makerToken.allowance.call(exchangeWrapper.address, dydxProxy)
  ]);

  return {
    makerMakerToken,
    makerTakerToken,
    exchangeWrapperMakerToken,
    exchangeWrapperTakerToken,
    exchangeWrapperProxyAllowance
  };
}

async function validateBalances(
  startingBalances,
  order,
  exchangeWrapper,
  amount,
  dydxProxy,
  tradedMakerTokenOverride = null,
) {
  const {
    makerMakerToken,
    makerTakerToken,
    exchangeWrapperMakerToken,
    exchangeWrapperTakerToken,
    exchangeWrapperProxyAllowance
  } = await getBalances(order, exchangeWrapper, dydxProxy);

  const tradedMakerToken = tradedMakerTokenOverride
    ? new BigNumber(tradedMakerTokenOverride)
    : getPartialAmount(
      amount,
      order.takerAssetAmount,
      order.makerAssetAmount
    );

  // Maker Balances
  expect(makerMakerToken).to.be.bignumber.eq(
    startingBalances.makerMakerToken.minus(tradedMakerToken)
  );

  expect(makerTakerToken).to.be.bignumber.eq(
    startingBalances.makerTakerToken.plus(amount)
  );

  // Exchange Wrapper Balances
  expect(exchangeWrapperMakerToken).to.be.bignumber.eq(
    startingBalances.exchangeWrapperMakerToken.plus(tradedMakerToken)
  );
  expect(exchangeWrapperTakerToken).to.be.bignumber.eq(0);

  // Exchange Wrapper TokenProxy Allowance
  expect(exchangeWrapperProxyAllowance).to.be.bignumber.gte(tradedMakerToken);
}
