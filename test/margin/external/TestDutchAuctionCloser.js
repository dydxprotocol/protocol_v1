/*global web3, artifacts, contract, describe, it, before, beforeEach,*/

const BigNumber = require('bignumber.js');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const ERC721MarginPosition = artifacts.require("ERC721MarginPosition");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const Margin = artifacts.require("Margin");
const ProxyContract = artifacts.require("Proxy");
const Vault = artifacts.require("Vault");

const { getOwedAmount } = require('../../helpers/ClosePositionHelper');
const { getMaxInterestFee, callClosePositionDirectly } = require('../../helpers/MarginHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');
const {
  doOpenPosition
} = require('../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

const ONE = new BigNumber(1);
const TWO = new BigNumber(2);

contract('DutchAuctionCloser', function(accounts) {
  let dydxMargin, VaultContract, ERC721MarginPositionContract;
  let OwedTokenContract, HeldTokenContract;
  let OpenTx;
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
      const contract = await DutchAuctionCloser.new(Margin.address, ONE, TWO);
      const [ssAddress, num, den] = await Promise.all([
        contract.MARGIN.call(),
        contract.CALL_TIMELIMIT_NUMERATOR.call(),
        contract.CALL_TIMELIMIT_DENOMINATOR.call(),
      ]);
      expect(ssAddress).to.equal(Margin.address);
      expect(num).to.be.bignumber.equal(ONE);
      expect(den).to.be.bignumber.equal(TWO);
    });
  });

  describe('#closePositionDirectly', () => {
    let salt = 1111;
    let callTimeLimit;

    beforeEach('approve DutchAuctionCloser for token transfers from bidder', async () => {
      OpenTx = await doOpenPosition(accounts, salt++, ERC721MarginPosition.address);
      await ERC721MarginPositionContract.approveRecipient(DutchAuctionCloser.address, true);
      await dydxMargin.marginCall(
        OpenTx.id,
        0, /*requiredDeposit*/
        { from: OpenTx.loanOffering.payer }
      );
      callTimeLimit = OpenTx.loanOffering.callTimeLimit;

      // grant tokens and set permissions for bidder
      const numTokens = await OwedTokenContract.balanceOf(dutchBidder);
      const maxInterest = await getMaxInterestFee(OpenTx);
      const targetTokens = OpenTx.principal.plus(maxInterest);

      if (numTokens < targetTokens) {
        await OwedTokenContract.issueTo(dutchBidder, targetTokens.minus(numTokens));
        await OwedTokenContract.approve(
          ProxyContract.address,
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
        OpenTx,
        OpenTx.principal.div(2),
        dutchBidder,
        DutchAuctionCloser.address
      ));
    });

    it('fails if bid too early', async () => {
      await wait(callTimeLimit / 4);

      await expectThrow(callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        OpenTx.principal.div(2),
        dutchBidder,
        DutchAuctionCloser.address
      ));
    });

    it('fails if bid too late', async () => {
      await wait(callTimeLimit + 1);

      await expectThrow(callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        OpenTx.principal.div(2),
        dutchBidder,
        DutchAuctionCloser.address
      ));
    });

    it('succeeds for unclosed position', async () => {
      await wait(callTimeLimit * 3 / 4);

      const startingBidderOwedToken = await OwedTokenContract.balanceOf(dutchBidder);
      const heldTokenVault = await VaultContract.balances.call(OpenTx.id, HeldToken.address);
      const closeAmount = OpenTx.principal.div(2);

      // closing half is fine
      const closeTx1 = await callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        closeAmount,
        dutchBidder,
        DutchAuctionCloser.address
      );
      const owedAmount1 = await getOwedAmount(OpenTx, closeTx1, closeAmount);

      // closing the other half is fine
      const closeTx2 = await callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        closeAmount,
        dutchBidder,
        DutchAuctionCloser.address
      );
      const owedAmount2 = await getOwedAmount(OpenTx, closeTx2, closeAmount);

      // cannot close half a third time
      await expectThrow(callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        closeAmount,
        dutchBidder,
        DutchAuctionCloser.address
      ));

      const [
        owedTokenBidder,
        heldTokenTrader,
        heldTokenBidder
      ] = await Promise.all([
        OwedTokenContract.balanceOf.call(dutchBidder),
        HeldTokenContract.balanceOf.call(OpenTx.trader),
        HeldTokenContract.balanceOf.call(dutchBidder),
      ]);

      // check amounts
      expect(owedTokenBidder).to.be.bignumber.equal(
        startingBidderOwedToken
          .minus(owedAmount1)
          .minus(owedAmount2)
      );
      expect(heldTokenTrader.plus(heldTokenBidder)).to.be.bignumber.equal(heldTokenVault);
    });
  });
});
