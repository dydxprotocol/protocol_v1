/*global web3, artifacts, contract, describe, it, before, beforeEach,*/

const BigNumber = require('bignumber.js');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const ERC721MarginPosition = artifacts.require("ERC721MarginPosition");
const QuoteToken = artifacts.require("TokenA");
const BaseToken = artifacts.require("TokenB");
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
  let marginContract, VaultContract, ERC721MarginPositionContract;
  let BaseTokenContract, QuoteTokenContract;
  let openTx;
  const dutchBidder = accounts[9];

  before('retrieve deployed contracts', async () => {
    [
      marginContract,
      VaultContract,
      ERC721MarginPositionContract,
      BaseTokenContract,
      QuoteTokenContract,
    ] = await Promise.all([
      Margin.deployed(),
      Vault.deployed(),
      ERC721MarginPosition.deployed(),
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
      openTx = await doOpenPosition(accounts, salt++, ERC721MarginPosition.address);
      await ERC721MarginPositionContract.approveRecipient(DutchAuctionCloser.address, true);
      await marginContract.marginCall(
        openTx.id,
        0, /*requiredDeposit*/
        { from: openTx.loanOffering.payer }
      );
      callTimeLimit = openTx.loanOffering.callTimeLimit;

      // grant tokens and set permissions for bidder
      const numTokens = await BaseTokenContract.balanceOf(dutchBidder);
      const maxInterest = await getMaxInterestFee(openTx);
      const targetTokens = openTx.amount.plus(maxInterest);

      if (numTokens < targetTokens) {
        await BaseTokenContract.issueTo(dutchBidder, targetTokens.minus(numTokens));
        await BaseTokenContract.approve(
          ProxyContract.address,
          targetTokens,
          { from: dutchBidder });
      }
    });

    it('fails if not approved', async () => {
      // dont approve dutch auction closer
      await ERC721MarginPositionContract.approveRecipient(DutchAuctionCloser.address, false);

      await wait(callTimeLimit * 3 / 4);

      await expectThrow( callClosePositionDirectly(
        marginContract,
        openTx,
        openTx.amount.div(2),
        dutchBidder,
        DutchAuctionCloser.address
      ));
    });

    it('fails if bid too early', async () => {
      await wait(callTimeLimit / 4);

      await expectThrow( callClosePositionDirectly(
        marginContract,
        openTx,
        openTx.amount.div(2),
        dutchBidder,
        DutchAuctionCloser.address
      ));
    });

    it('fails if bid too late', async () => {
      await wait(callTimeLimit + 1);

      await expectThrow( callClosePositionDirectly(
        marginContract,
        openTx,
        openTx.amount.div(2),
        dutchBidder,
        DutchAuctionCloser.address
      ));
    });

    it('succeeds for unclosed position', async () => {
      await wait(callTimeLimit * 3 / 4);

      const startingBidderBaseToken = await BaseTokenContract.balanceOf(dutchBidder);
      const quoteVault = await VaultContract.balances.call(openTx.id, QuoteToken.address);
      const closeAmount = openTx.amount.div(2);

      // closing half is fine
      const closeTx1 = await callClosePositionDirectly(
        marginContract,
        openTx,
        closeAmount,
        dutchBidder,
        DutchAuctionCloser.address
      );
      const owedAmount1 = await getOwedAmount(openTx, closeTx1, closeAmount);

      // closing the other half is fine
      const closeTx2 = await callClosePositionDirectly(
        marginContract,
        openTx,
        closeAmount,
        dutchBidder,
        DutchAuctionCloser.address
      );
      const owedAmount2 = await getOwedAmount(openTx, closeTx2, closeAmount);

      // cannot close half a third time
      await expectThrow( callClosePositionDirectly(
        marginContract,
        openTx,
        closeAmount,
        dutchBidder,
        DutchAuctionCloser.address
      ));

      const [
        baseBidder,
        quoteTrader,
        quoteBidder
      ] = await Promise.all([
        BaseTokenContract.balanceOf.call(dutchBidder),
        QuoteTokenContract.balanceOf.call(openTx.trader),
        QuoteTokenContract.balanceOf.call(dutchBidder),
      ]);

      // check amounts
      expect(baseBidder).to.be.bignumber.equal(
        startingBidderBaseToken
          .minus(owedAmount1)
          .minus(owedAmount2)
      );
      expect(quoteTrader.plus(quoteBidder)).to.be.bignumber.equal(quoteVault);
    });
  });
});
