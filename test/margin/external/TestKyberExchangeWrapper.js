/*global artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const KyberExchangeWrapper = artifacts.require("KyberExchangeWrapper");
const KyberNetworkSimple = artifacts.require("KyberNetworkSimple");
const WETHtoken = artifacts.require("WETH9");
const TokenA = artifacts.require("TokenA");

const { BIGNUMBERS, ADDRESSES } = require('../../helpers/Constants');
const { zeroExOrderToBytes } = require('../../helpers/BytesHelper');
const { createSignedSellOrder, signOrder } = require('../../helpers/ZeroExHelper');
const { getPartialAmount } = require('../../helpers/MathHelper');
const { issueAndSetAllowance } = require('../../helpers/TokenHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');

const baseAmount = new BigNumber('1e18');

describe('KyberExchangeWrapper', () => {
  describe('Constructor', () => {
    contract('KyberExchangeWrapper' , accounts => {
      it('sets constants correctly', async () => {
        const {
          dydxMargin,
          dydxProxy,
          exchangeWrapper,
          WETHToken
        } = await setup(accounts);

        const [
          DYDX_PROXY,
          KYBER_NETWORK,
          WRAPPED_ETH,
          DYDX_MARGIN
        ] = await Promise.all([
          exchangeWrapper.DYDX_PROXY.call(),
          exchangeWrapper.KYBER_NETWORK.call(),
          exchangeWrapper.WRAPPED_ETH.call(),
          exchangeWrapper.DYDX_MARGIN.call()
        ]);

        expect(DYDX_PROXY).to.eq(dydxProxy);
        expect(DYDX_MARGIN).to.eq(dydxMargin);
        expect(KYBER_NETWORK).to.eq(KyberNetworkSimple.address);
        expect(WRAPPED_ETH).to.eq(WETHToken.address);

      })
    })
  })
})

async function setup(accounts) {
  const dydxMargin = accounts[1];
  const dydxProxy = accounts[2];
  const tradeOriginator = accounts[3];

  const WETHToken = await WETHToken.deployed();

  const exchangeWrapper = await KyberExchangeWrapper.new(
    dydxMargin,
    dydxProxy,
    KyberNetworkSimple.address,
    WETHToken.address
  );
  return {
    dydxMargin,
    dydxProxy,
    exchangeWrapper,
    WETHToken,
    tradeOriginator
  }
}
