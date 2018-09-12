const BigNumber = require('bignumber.js');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const OwedToken = artifacts.require("TokenB");
const AuctionProxy = artifacts.require("AuctionProxy");
const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const ZeroExV1ExchangeWrapper = artifacts.require("ZeroExV1ExchangeWrapper");
const ERC20Short = artifacts.require("ERC20Short");
const Margin = artifacts.require("Margin");
const { ZeroExExchangeV1, ZeroExProxyV1 } = require('../../../contracts/ZeroExV1');

const { zeroExV1OrderToBytes } = require('../../../helpers/BytesHelper');
const { ADDRESSES, BIGNUMBERS, BYTES32 } = require('../../../helpers/Constants');
const { expectThrow } = require('../../../helpers/ExpectHelper');
const { transact } = require('../../../helpers/ContractHelper');
const { doOpenPosition } = require('../../../helpers/MarginHelper');
const {
  createSignedV1SellOrder,
  signOrder,
  getV1OrderHash
} = require('../../../helpers/ZeroExV1Helper');
const { issueAndSetAllowance } = require('../../../helpers/TokenHelper');
const { wait } = require('@digix/tempo')(web3);

contract('AuctionProxy', accounts => {
  let owedToken;
  let dydxMargin;
  let dutchAuction;
  let auctionProxy;

  let positionId;

  before('retrieve deployed contracts', async () => {
    [
      owedToken,
      dydxMargin,
      dutchAuction,
    ] = await Promise.all([
      OwedToken.deployed(),
      Margin.deployed(),
      DutchAuctionCloser.deployed(),
    ]);
    auctionProxy = await AuctionProxy.new(dydxMargin.address);
    const tx = await doOpenPosition(accounts);
    positionId = tx.id;

    // tokenify position
    const tokenContract = await ERC20Short.new(
      positionId,
      dydxMargin.address,
      accounts[2],
      [dutchAuction.address],
      [accounts[0]]
    );
    await dydxMargin.transferPosition(
      positionId,
      tokenContract.address,
      { from: tx.trader }
    );
    await dydxMargin.marginCall(positionId, 0, { from: tx.loanOffering.owner });
    await wait(tx.loanOffering.callTimeLimit * 99 / 100);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const expectedAddress = ADDRESSES.TEST[0];
      const contract = await AuctionProxy.new(expectedAddress);
      const marginAddress = await contract.DYDX_MARGIN.call();
      expect(marginAddress).to.eq(expectedAddress);
    });
  });

  describe('#closePosition', () => {
    it('succeeds', async () => {
      const order = await createOrder();

      // close it once normally using the dutchAuction
      await dydxMargin.closePosition(
        positionId,
        order.makerTokenAmount.div(2),
        dutchAuction.address,
        ZeroExV1ExchangeWrapper.address,
        true,
        zeroExV1OrderToBytes(order),
      );

      // close it using the auction proxy
      await transact(
        auctionProxy.closePosition,
        positionId,
        0,
        dutchAuction.address,
        ZeroExV1ExchangeWrapper.address,
        zeroExV1OrderToBytes(order)
      );

      const exchange = await ZeroExExchangeV1.deployed();
      const unavail = await exchange.getUnavailableTakerTokenAmount.call(getV1OrderHash(order));
      expect(order.takerTokenAmount.minus(unavail)).to.be.bignumber.lte(10);
    });

    it('returns zero for non-open position', async () => {
      const order = await createOrder();
      const receipt = await transact(
        auctionProxy.closePosition,
        BYTES32.BAD_ID,
        0,
        dutchAuction.address,
        ZeroExV1ExchangeWrapper.address,
        zeroExV1OrderToBytes(order)
      );
      expect(receipt.result).to.be.bignumber.equal(0);
    });

    it('fails early for taker fee', async () => {
      const order = await createOrder();
      order.feeRecipient = ADDRESSES.TEST[0];
      order.takerFee = new BigNumber(10);
      order.ecSignature = await signOrder(order);

      await expectThrow(
        auctionProxy.closePosition(
          positionId,
          0,
          dutchAuction.address,
          ZeroExV1ExchangeWrapper.address,
          zeroExV1OrderToBytes(order)
        )
      );
    });

    it('returns zero for large minCloseAmount', async () => {
      const order = await createOrder();
      const receipt = await transact(
        auctionProxy.closePosition,
        positionId,
        BIGNUMBERS.MAX_UINT256,
        dutchAuction.address,
        ZeroExV1ExchangeWrapper.address,
        zeroExV1OrderToBytes(order)
      );
      expect(receipt.result).to.be.bignumber.equal(0);
    });

    it('returns zero for expired order', async () => {
      const order = await createOrder();
      order.expirationUnixTimestampSec = new BigNumber(10);
      order.ecSignature = await signOrder(order);
      const receipt = await transact(
        auctionProxy.closePosition,
        positionId,
        0,
        dutchAuction.address,
        ZeroExV1ExchangeWrapper.address,
        zeroExV1OrderToBytes(order)
      );
      expect(receipt.result).to.be.bignumber.equal(0);
    });
  });

  let salt = 0;
  async function createOrder() {
    let order = await createSignedV1SellOrder(accounts);
    order.makerFee = BIGNUMBERS.ZERO;
    order.takerFee = BIGNUMBERS.ZERO;
    order.makerTokenAmount = order.makerTokenAmount.div(100).floor();
    order.takerTokenAmount = order.takerTokenAmount.div(100).floor();
    order.feeRecipient = ADDRESSES.ZERO;
    order.salt = salt++;
    order.ecSignature = await signOrder(order);
    await issueAndSetAllowance(
      owedToken,
      order.maker,
      order.makerTokenAmount,
      ZeroExProxyV1.address
    );
    return order;
  }
});
