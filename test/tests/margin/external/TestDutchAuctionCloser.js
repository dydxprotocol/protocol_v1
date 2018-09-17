const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const ERC721MarginPosition = artifacts.require("ERC721MarginPosition");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const Margin = artifacts.require("Margin");
const TokenProxy = artifacts.require("TokenProxy");
const Vault = artifacts.require("Vault");

const { getOwedAmount } = require('../../../helpers/ClosePositionHelper');
const {
  callClosePositionDirectly,
  doClosePosition,
  getMaxInterestFee
} = require('../../../helpers/MarginHelper');
const { expectThrow } = require('../../../helpers/ExpectHelper');
const {
  doOpenPosition
} = require('../../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

contract('DutchAuctionCloser', accounts => {
  let dydxMargin, VaultContract, ERC721MarginPositionContract;
  let OwedTokenContract, HeldTokenContract;
  let openTx;
  const dutchBidder = accounts[9];

  before('retrieve deployed contracts', async () => {
    [
      dydxMargin,
      VaultContract,
      ERC721MarginPositionContract,
      OwedTokenContract,
      HeldTokenContract,
    ] = await Promise.all([
      Margin.deployed(),
      Vault.deployed(),
      ERC721MarginPosition.deployed(),
      OwedToken.deployed(),
      HeldToken.deployed(),
    ]);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const [startNum, startDen, endNum, endDen] = [1, 2, 3, 4];
      const contract = await DutchAuctionCloser.new(
        Margin.address,
        startNum,
        startDen,
        endNum,
        endDen
      );
      const [ssAddress, startFraction, endFraction] = await Promise.all([
        contract.DYDX_MARGIN.call(),
        contract.auctionStartFraction.call(),
        contract.auctionEndFraction.call(),
      ]);
      expect(ssAddress).to.be.bignumber.eq(dydxMargin.address);
      expect(startFraction[0]).to.be.bignumber.eq(startNum);
      expect(startFraction[1]).to.be.bignumber.eq(startDen);
      expect(endFraction[0]).to.be.bignumber.eq(endNum);
      expect(endFraction[1]).to.be.bignumber.eq(endDen);
    });

    it('fails for bad constants', async () => {
      // zero denominators
      await expectThrow(DutchAuctionCloser.new(Margin.address, 1, 0, 2, 2));
      await expectThrow(DutchAuctionCloser.new(Margin.address, 1, 2, 2, 0));

      // fractions larger than 1
      await expectThrow(DutchAuctionCloser.new(Margin.address, 1, 2, 3, 2));
      await expectThrow(DutchAuctionCloser.new(Margin.address, 3, 2, 1, 1));

      // denominator larger than numerator
      await expectThrow(DutchAuctionCloser.new(Margin.address, 1, 1, 1, 2));
      await expectThrow(DutchAuctionCloser.new(Margin.address, 2, 3, 4, 8));
    });
  });

  describe('#closePositionDirectly', () => {
    let salt = 1111;
    let callTimeLimit;

    beforeEach('approve DutchAuctionCloser for token transfers from bidder', async () => {
      openTx = await doOpenPosition(
        accounts,
        {
          salt: salt++,
          positionOwner: ERC721MarginPosition.address
        }
      );
      await ERC721MarginPositionContract.approveRecipient(
        DutchAuctionCloser.address,
        true,
        { from: openTx.trader }
      );
      await dydxMargin.marginCall(
        openTx.id,
        0 /*requiredDeposit*/,
        { from: openTx.loanOffering.owner }
      );
      callTimeLimit = openTx.loanOffering.callTimeLimit;

      // grant tokens and set permissions for bidder
      const numTokens = await OwedTokenContract.balanceOf.call(dutchBidder);
      const maxInterest = await getMaxInterestFee(openTx);
      const targetTokens = openTx.principal.plus(maxInterest);

      if (numTokens < targetTokens) {
        await OwedTokenContract.issueTo(dutchBidder, targetTokens.minus(numTokens));
        await OwedTokenContract.approve(
          TokenProxy.address,
          targetTokens,
          { from: dutchBidder });
      }
    });

    it('fails for unapproved position', async () => {
      // dont approve dutch auction closer
      await ERC721MarginPositionContract.approveRecipient(DutchAuctionCloser.address, false);

      await wait(callTimeLimit * 3 / 4);

      await expectThrow(callClosePositionDirectly(
        dydxMargin,
        openTx,
        openTx.principal.div(2),
        {
          from: dutchBidder,
          recipient: DutchAuctionCloser.address
        }
      ));
    });

    it('fails if bid too early', async () => {
      const dutchCloser = await DutchAuctionCloser.new(Margin.address, 1, 2, 1, 1);
      await ERC721MarginPositionContract.approveRecipient(
        dutchCloser.address,
        true,
        { from: openTx.trader }
      );

      await wait(callTimeLimit / 4);

      await expectThrow(callClosePositionDirectly(
        dydxMargin,
        openTx,
        openTx.principal.div(2),
        {
          from: dutchBidder,
          recipient: dutchCloser.address
        }
      ));
    });

    it('fails if bid too late', async () => {
      await wait(callTimeLimit + 1);

      await expectThrow(callClosePositionDirectly(
        dydxMargin,
        openTx,
        openTx.principal.div(2),
        {
          from: dutchBidder,
          recipient: DutchAuctionCloser.address
        }
      ));
    });

    it('succeeds for position near end of maxDuration', async () => {
      await dydxMargin.cancelMarginCall(openTx.id, { from: openTx.loanOffering.owner });
      await wait(openTx.loanOffering.maxDuration - callTimeLimit);

      const closeAmount = openTx.principal.div(2).floor();

      // closing half is fine
      await callClosePositionDirectly(
        dydxMargin,
        openTx,
        closeAmount,
        {
          from: dutchBidder,
          recipient: DutchAuctionCloser.address
        }
      );
    });

    it('succeeds for position near end of maxDuration even if margin-called', async () => {
      await dydxMargin.cancelMarginCall(openTx.id, { from: openTx.loanOffering.owner });
      await wait(openTx.loanOffering.maxDuration - callTimeLimit);
      await dydxMargin.marginCall(openTx.id, 0, { from: openTx.loanOffering.owner });

      const closeAmount = openTx.principal.div(2).floor();

      // closing half is fine
      await callClosePositionDirectly(
        dydxMargin,
        openTx,
        closeAmount,
        {
          from: dutchBidder,
          recipient: DutchAuctionCloser.address
        }
      );
    });

    it('fails for payout in owedToken', async () => {
      await wait(callTimeLimit - 60);
      const closeAmount = openTx.principal.div(2).floor();

      // closing half is fine (set trader to bidder temporarily for doClosePosition)
      const trader = openTx.trader;
      openTx.trader = dutchBidder;
      await expectThrow(
        doClosePosition(
          accounts,
          openTx,
          closeAmount,
          {
            salt: 99999,
            callCloseArgs: {
              from: dutchBidder,
              recipient: DutchAuctionCloser.address,
              payoutInHeldToken: false
            }
          }
        )
      );
      openTx.trader = trader;
    });

    it('succeeds for unclosed position', async () => {
      await wait(callTimeLimit * 1 / 2);

      const [
        owedTokenBidder0,
        heldTokenTrader0,
        heldTokenBidder0
      ] = await Promise.all([
        OwedTokenContract.balanceOf.call(dutchBidder),
        HeldTokenContract.balanceOf.call(openTx.trader),
        HeldTokenContract.balanceOf.call(dutchBidder),
      ]);

      const heldTokenVault = await VaultContract.balances.call(openTx.id, HeldToken.address);
      const closeAmount = openTx.principal.div(2).floor();

      // closing half is fine
      const closeTx1 = await callClosePositionDirectly(
        dydxMargin,
        openTx,
        closeAmount,
        {
          from: dutchBidder,
          recipient: DutchAuctionCloser.address
        }
      );
      const owedAmount1 = await getOwedAmount(openTx, closeTx1, closeAmount);

      // closing the other half is fine
      const closeTx2 = await callClosePositionDirectly(
        dydxMargin,
        openTx,
        closeAmount,
        {
          from: dutchBidder,
          recipient: DutchAuctionCloser.address
        }
      );
      const owedAmount2 = await getOwedAmount(openTx, closeTx2, closeAmount);

      // cannot close half a third time
      await expectThrow(callClosePositionDirectly(
        dydxMargin,
        openTx,
        closeAmount,
        {
          from: dutchBidder,
          recipient: DutchAuctionCloser.address
        }
      ));

      const [
        owedTokenBidder1,
        heldTokenTrader1,
        heldTokenBidder1
      ] = await Promise.all([
        OwedTokenContract.balanceOf.call(dutchBidder),
        HeldTokenContract.balanceOf.call(openTx.trader),
        HeldTokenContract.balanceOf.call(dutchBidder),
      ]);

      // check amounts
      expect(
        owedTokenBidder0.minus(owedTokenBidder1)
      ).to.be.bignumber.equal(
        owedAmount1.plus(owedAmount2)
      );

      // check that all the held token in the vault went to either the trader or the bidder
      const traderDiff = heldTokenTrader1.minus(heldTokenTrader0);
      const bidderDiff = heldTokenBidder1.minus(heldTokenBidder0);
      expect(bidderDiff).to.be.bignumber.not.equal(0);
      expect(traderDiff).to.be.bignumber.not.equal(0);
      expect(
        traderDiff.plus(bidderDiff)
      ).to.be.bignumber.equal(
        heldTokenVault
      );
    });
  });
});
