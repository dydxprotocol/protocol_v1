const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
const BigNumber = require('bignumber.js');

const WethPayoutRecipient = artifacts.require("WethPayoutRecipient");
const HeldToken = artifacts.require("TokenA");
const WETH9 = artifacts.require("WETH9");
const Margin = artifacts.require("Margin");
const TokenProxy = artifacts.require("TokenProxy");
const ZeroExV1ExchangeWrapper = artifacts.require("ZeroExV1ExchangeWrapper");
const { ZeroExExchangeV1, ZeroExProxyV1 } = require('../../../contracts/ZeroExV1');

const { expectThrow } = require('../../../helpers/ExpectHelper');
const { issueTokenToAccountInAmountAndApproveProxy } = require('../../../helpers/MarginHelper');
const { ADDRESSES, BIGNUMBERS, ORDER_TYPE } = require('../../../helpers/Constants');
const { signOrder } = require('../../../helpers/ZeroExV1Helper');
const { zeroExV1OrderToBytes } = require('../../../helpers/BytesHelper');

contract('DutchAuctionCloser', accounts => {
  let dydxMargin, tokenProxy, weth, heldToken;
  const opener = accounts[9];
  const loanHolder = accounts[8];
  const OgAmount = new BigNumber('1e9');
  let positionId1, positionId2;

  before('retrieve deployed contracts, set up two large positions', async () => {
    // retrieve deployed contracts
    [
      dydxMargin,
      tokenProxy,
      weth,
      heldToken,
    ] = await Promise.all([
      Margin.deployed(),
      TokenProxy.deployed(),
      WETH9.deployed(),
      HeldToken.deployed(),
    ]);

    // set up tokens
    await Promise.all([
      weth.deposit({ value: OgAmount.times(10), from: opener }),
      issueTokenToAccountInAmountAndApproveProxy(heldToken, opener, OgAmount.times(10)),
      weth.approve(tokenProxy.address, BIGNUMBERS.MAX_UINT256, { from: opener }),
    ]);

    // open two positions
    positionId1 = web3Instance.utils.soliditySha3(opener, 1);
    positionId2 = web3Instance.utils.soliditySha3(opener, 2);
    await Promise.all([
      dydxMargin.openWithoutCounterparty(
        [
          opener,
          heldToken.address, // owedToken
          weth.address,
          loanHolder
        ],
        [OgAmount, OgAmount, 1],
        [1, 1, 0, 1],
        { from: opener }
      ),
      dydxMargin.openWithoutCounterparty(
        [
          opener,
          weth.address, // owedToken
          heldToken.address,
          loanHolder
        ],
        [OgAmount, OgAmount, 2],
        [1, 1, 0, 1],
        { from: opener }
      ),
    ]);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const contract = await WethPayoutRecipient.new(weth.address);
      const c_weth = await contract.WETH.call();
      expect(c_weth).to.be.eq(weth.address);
    });
  });

  describe('#closePositionDirectly', () => {
    const closeAmount = OgAmount.div(10);

    it('succeeds for weth heldToken', async () => {
      await dydxMargin.closePositionDirectly(
        positionId1,
        closeAmount,
        WethPayoutRecipient.address,
        { from: opener }
      );
    });

    it('succeeds for weth owedToken', async () => {
      const seller = accounts[5];

      // set up tokens
      await Promise.all([
        weth.deposit({ value: OgAmount.times(10), from: seller }),
        weth.approve(ZeroExProxyV1.address, BIGNUMBERS.MAX_UINT256, { from: seller }),
      ]);

      // set up order
      let order = {
        type: ORDER_TYPE.ZERO_EX_V1,
        exchangeContractAddress: ZeroExExchangeV1.address,
        expirationUnixTimestampSec: new BigNumber(100000000000000),
        feeRecipient: ADDRESSES.ZERO,
        maker: seller,
        makerFee: BIGNUMBERS.ZERO,
        salt: new BigNumber(11),
        taker: ADDRESSES.ZERO,
        takerFee: BIGNUMBERS.ZERO,
        makerTokenAddress: weth.address,
        makerTokenAmount: BIGNUMBERS.MAX_UINT128,
        takerTokenAddress: heldToken.address,
        takerTokenAmount: BIGNUMBERS.MAX_UINT128.div(10).floor(),
      };
      order.ecSignature = await signOrder(order);
      // close the position
      await dydxMargin.closePosition(
        positionId2,
        closeAmount,
        WethPayoutRecipient.address,
        ZeroExV1ExchangeWrapper.address,
        false,
        zeroExV1OrderToBytes(order),
        { from: opener }
      );
    });

    it('fails if payout is not in weth', async () => {
      await expectThrow(
        dydxMargin.closePositionDirectly(
          positionId2,
          closeAmount,
          WethPayoutRecipient.address,
          { from: opener }
        )
      );
    });
  });
});
