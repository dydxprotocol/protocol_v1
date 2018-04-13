/*global web3, artifacts, contract, describe, it, before, beforeEach,*/

const BigNumber = require('bignumber.js');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const ERC721Short = artifacts.require("ERC721Short");
const QuoteToken = artifacts.require("TokenA");
const BaseToken = artifacts.require("TokenB");
const Margin = artifacts.require("Margin");
const ProxyContract = artifacts.require("Proxy");
const Vault = artifacts.require("Vault");

const { getOwedAmount } = require('../../helpers/ClosePositionHelper');
const { getMaxInterestFee, callClosePositionDirectly } = require('../../helpers/MarginHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');
const {
  doShort
} = require('../../helpers/MarginHelper');
const { wait } = require('@digix/tempo')(web3);

const ONE = new BigNumber(1);
const TWO = new BigNumber(2);

contract('DutchAuctionCloser', function(accounts) {
  let dydxMargin, VaultContract, ERC721ShortContract;
  let BaseTokenContract, QuoteTokenContract;
  let OpenTx;
  const dutchBidder = accounts[9];

  before('retrieve deployed contracts', async () => {
    [
      dydxMargin,
      VaultContract,
      ERC721ShortContract,
      BaseTokenContract,
      QuoteTokenContract,
    ] = await Promise.all([
      Margin.deployed(),
      Vault.deployed(),
      ERC721Short.deployed(),
      BaseToken.deployed(),
      QuoteToken.deployed(),
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
      OpenTx = await doShort(accounts, salt++, ERC721Short.address);
      await ERC721ShortContract.approveRecipient(DutchAuctionCloser.address, true);
      await dydxMargin.marginCall(
        OpenTx.id,
        0, /*requiredDeposit*/
        { from: OpenTx.loanOffering.payer }
      );
      callTimeLimit = OpenTx.loanOffering.callTimeLimit;

      // grant tokens and set permissions for bidder
      const numTokens = await BaseTokenContract.balanceOf(dutchBidder);
      const maxInterest = await getMaxInterestFee(OpenTx);
      const targetTokens = OpenTx.principal.plus(maxInterest);

      if (numTokens < targetTokens) {
        await BaseTokenContract.issueTo(dutchBidder, targetTokens.minus(numTokens));
        await BaseTokenContract.approve(
          ProxyContract.address,
          targetTokens,
          { from: dutchBidder });
      }
    });

    it('fails for unapproved short', async () => {
      // dont approve dutch auction closer
      await ERC721ShortContract.approveRecipient(DutchAuctionCloser.address, false);

      await wait(callTimeLimit * 3 / 4);

      await expectThrow( callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        OpenTx.principal.div(2),
        dutchBidder,
        DutchAuctionCloser.address
      ));
    });

    it('fails if bid too early', async () => {
      await wait(callTimeLimit / 4);

      await expectThrow( callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        OpenTx.principal.div(2),
        dutchBidder,
        DutchAuctionCloser.address
      ));
    });

    it('fails if bid too late', async () => {
      await wait(callTimeLimit + 1);

      await expectThrow( callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        OpenTx.principal.div(2),
        dutchBidder,
        DutchAuctionCloser.address
      ));
    });

    it('succeeds for full short', async () => {
      await wait(callTimeLimit * 3 / 4);

      const startingBidderBaseToken = await BaseTokenContract.balanceOf(dutchBidder);
      const quoteVault = await VaultContract.balances.call(OpenTx.id, QuoteToken.address);
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
      await expectThrow( callClosePositionDirectly(
        dydxMargin,
        OpenTx,
        closeAmount,
        dutchBidder,
        DutchAuctionCloser.address
      ));

      const [
        baseBidder,
        quoteSeller,
        quoteBidder
      ] = await Promise.all([
        BaseTokenContract.balanceOf.call(dutchBidder),
        QuoteTokenContract.balanceOf.call(OpenTx.seller),
        QuoteTokenContract.balanceOf.call(dutchBidder),
      ]);

      // check amounts
      expect(baseBidder).to.be.bignumber.equal(
        startingBidderBaseToken
          .minus(owedAmount1)
          .minus(owedAmount2)
      );
      expect(quoteSeller.plus(quoteBidder)).to.be.bignumber.equal(quoteVault);
    });
  });
});
