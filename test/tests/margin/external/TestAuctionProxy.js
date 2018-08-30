const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const AuctionProxy = artifacts.require("AuctionProxy");
const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const ZeroExExchange = artifacts.require("ZeroExExchange");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const Margin = artifacts.require("Margin");
const TokenProxy = artifacts.require("TokenProxy");
const Vault = artifacts.require("Vault");

const { ADDRESSES } = require('../../../helpers/Constants');
const { getOwedAmount } = require('../../../helpers/ClosePositionHelper');
const {
  callClosePositionDirectly,
  doClosePosition,
  getMaxInterestFee
} = require('../../../helpers/MarginHelper');
const { expectThrow } = require('../../../helpers/ExpectHelper');
const { transact } = require('../../../helpers/ContractHelper');
const { doOpenPosition } = require('../../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

contract('AuctionProxy', accounts => {
  let dydxMargin;
  let dutchAuction;
  let zeroExExchange;
  let zeroExExchangeWrapper;
  let auctionProxy;

  let positionId;
  const dutchBidder = accounts[9];

  before('retrieve deployed contracts', async () => {
    [
      dydxMargin,
      dutchAuction,
      ,
      zeroExExchange,
    ] = await Promise.all([
      Margin.deployed(),
      DutchAuctionCloser.deployed(),
      ZeroExExchange.deployed(),
    ]);
    auctionProxy = await AuctionProxy.new(dydxMargin.address, ZeroExExchange.address);

    const tx = await doOpenPosition(accounts);
    positionId = tx.id;

    tokenContract = await ERC20Short.new(
      positionId,
      dydxMargin.address,
      INITIAL_TOKEN_HOLDER,
      POSITIONS.FULL.TRUSTED_RECIPIENTS,
      []
    );

    await marginCallPo

  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const address1 = ADDRESSES.TEST[0];
      const address2 = ADDRESSES.TEST[1];
      const contract = await AuctionProxy.new(address1, address2);
      const [c1, c2] = await Promise.all([
        contract.DYDX_MARGIN.call(),
        contract.ZERO_EX_EXCHANGE.call()
      ]);
      expect(c1).to.eq(address1);
      expect(c2).to.eq(address2);
    });

    it('fails for bad constants', async () => {
      await expectThrow(DutchAuctionCloser.new(Margin.address, 0, 2));
      await expectThrow(DutchAuctionCloser.new(Margin.address, 3, 2));
    });
  });

  describe('#closePosition', () => {
    it('succeeds', async () => {
      const receipt = await transact(
        auctionProxy.closePosition,
        positionId,
        dutchAuction.address,
        zeroExExchangeWrapper.address,
        orderBytes
      );
    });
    it('fails early for taker fee', async () => {
    });
    it('fails early for expired order', async () => {
    });
  });
});
