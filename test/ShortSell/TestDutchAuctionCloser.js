/*global web3, artifacts, contract, describe, it, before, beforeEach,*/

const BigNumber = require('bignumber.js');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const ERC721Short = artifacts.require("ERC721Short");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const ShortSell = artifacts.require("ShortSell");
const ProxyContract = artifacts.require("Proxy");
const Vault = artifacts.require("Vault");

const { expectThrow } = require('../helpers/ExpectHelper');
const {
  doShort
} = require('../helpers/ShortSellHelper');
const { wait } = require('@digix/tempo')(web3);

const ONE = new BigNumber(1);
const TWO = new BigNumber(2);

contract('DutchAuctionCloser', function(accounts) {
  let shortSellContract, VaultContract, ERC721ShortContract;
  let UnderlyingTokenContract, BaseTokenContract;
  let shortTx;
  const dutchBidder = accounts[9];

  before('retrieve deployed contracts', async () => {
    [
      shortSellContract,
      VaultContract,
      ERC721ShortContract,
      UnderlyingTokenContract,
      BaseTokenContract,
    ] = await Promise.all([
      ShortSell.deployed(),
      Vault.deployed(),
      ERC721Short.deployed(),
      UnderlyingToken.deployed(),
      BaseToken.deployed(),
    ]);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const contract = await DutchAuctionCloser.new(ShortSell.address, ONE, TWO);
      const [ssAddress, num, den] = await Promise.all([
        contract.SHORT_SELL.call(),
        contract.CALL_TIMELIMIT_NUMERATOR.call(),
        contract.CALL_TIMELIMIT_DENOMINATOR.call(),
      ]);
      expect(ssAddress).to.equal(ShortSell.address);
      expect(num).to.be.bignumber.equal(ONE);
      expect(den).to.be.bignumber.equal(TWO);
    });
  });

  describe('#closeShortDirectly', () => {
    let salt = 1111;
    let callTimeLimit;

    beforeEach('approve DutchAuctionCloser for token transfers from bidder', async () => {
      shortTx = await doShort(accounts, salt++, ERC721Short.address);
      await ERC721ShortContract.approveRecipient(DutchAuctionCloser.address, true);
      await shortSellContract.callInLoan(
        shortTx.id,
        0, /*requiredDeposit*/
        { from: shortTx.loanOffering.lender }
      );
      callTimeLimit = shortTx.loanOffering.callTimeLimit;

      // grant tokens and set permissions for bidder
      const numTokens = await UnderlyingTokenContract.balanceOf(dutchBidder);
      await UnderlyingTokenContract.issueTo(dutchBidder, shortTx.shortAmount.minus(numTokens));
      await UnderlyingTokenContract.approve(
        ProxyContract.address,
        shortTx.shortAmount,
        { from: dutchBidder });
    });

    it('fails for unapproved short', async () => {
      // dont approve dutch auction closer
      await ERC721ShortContract.approveRecipient(DutchAuctionCloser.address, false);

      await wait(callTimeLimit * 3 / 4);

      await expectThrow(
        () => shortSellContract.closeShortDirectly(
          shortTx.id,
          shortTx.shortAmount.div(2),
          DutchAuctionCloser.address,
          { from: dutchBidder }));
    });

    it('fails if bid too early', async () => {
      await wait(callTimeLimit / 4);

      await expectThrow(
        () => shortSellContract.closeShortDirectly(
          shortTx.id,
          shortTx.shortAmount.div(2),
          DutchAuctionCloser.address,
          { from: dutchBidder }));
    });

    it('fails if bid too late', async () => {
      await wait(callTimeLimit + 1);

      await expectThrow(
        () => shortSellContract.closeShortDirectly(
          shortTx.id,
          shortTx.shortAmount.div(2),
          DutchAuctionCloser.address,
          { from: dutchBidder }));
    });

    it('succeeds for full short', async () => {
      await wait(callTimeLimit * 3 / 4);

      const baseVault = await VaultContract.balances.call(shortTx.id, BaseToken.address);

      // closing half is fine
      await shortSellContract.closeShortDirectly(
        shortTx.id,
        shortTx.shortAmount.div(2),
        DutchAuctionCloser.address,
        { from: dutchBidder });

      // closing the other half is fine
      await shortSellContract.closeShortDirectly(
        shortTx.id,
        shortTx.shortAmount.div(2),
        DutchAuctionCloser.address,
        { from: dutchBidder });

      // cannot close half a third time
      await expectThrow(
        () => shortSellContract.closeShortDirectly(
          shortTx.id,
          shortTx.shortAmount.div(2),
          DutchAuctionCloser.address,
          { from: dutchBidder }));

      const [
        baseLender,
        baseSeller,
        baseBidder
      ] = await Promise.all([
        BaseTokenContract.balanceOf.call(shortTx.loanOffering.lender),
        BaseTokenContract.balanceOf.call(shortTx.seller),
        BaseTokenContract.balanceOf.call(dutchBidder),
      ]);

      // check baseBidder and baseSeller are pretty much the same
      const maxInterestFee = baseVault.dividedBy('10000');
      expect(baseSeller.minus(baseBidder).abs()).to.be.bignumber.lessThan(maxInterestFee);
      expect(baseLender.plus(baseSeller).plus(baseBidder)).to.be.bignumber.equal(baseVault);
    });
  });
});
