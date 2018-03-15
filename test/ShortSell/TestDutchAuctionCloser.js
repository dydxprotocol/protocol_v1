/*global web3, artifacts, contract, describe, it, before, beforeEach,*/

const Web3 = require('web3');
const BigNumber = require('bignumber.js');
const web3Instance = new Web3(web3.currentProvider);
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const DutchAuctionCloser = artifacts.require("DutchAuctionCloser");
const ERC20ShortCreator = artifacts.require("ERC20ShortCreator");
const ERC20Short = artifacts.require("ERC20Short");
const ERC721Short = artifacts.require("ERC721Short");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const ShortSell = artifacts.require("ShortSell");
const ProxyContract = artifacts.require("Proxy");

const { ADDRESSES, BIGNUMBERS, BYTES32 } = require('../helpers/Constants');
const { TOKENIZED_SHORT_STATE } = require('../helpers/ERC20ShortHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const {
  doShort,
  issueTokensAndSetAllowancesForClose,
  callCloseShort,
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort
} = require('../helpers/ShortSellHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');
const { wait } = require('@digix/tempo')(web3);

const ONE = new BigNumber(1);
const TWO = new BigNumber(2);

contract('DutchAuctionCloser', function(accounts) {
  let shortSellContract, ERC721ShortContract, DutchAuctionCloserContract;
  let UnderlyingTokenContract;
  let salt = 1111;
  let shortTx;
  const dutchBidder = accounts[9];

  before('retrieve deployed contracts', async () => {
    [
      shortSellContract,
      ERC721ShortContract,
      DutchAuctionCloserContract,
      UnderlyingTokenContract,
    ] = await Promise.all([
      ShortSell.deployed(),
      ERC721Short.deployed(),
      DutchAuctionCloser.deployed(),
      UnderlyingToken.deployed()
    ]);
  });

  describe('Constructor', () => {
    it('sets constants correctly', async () => {
      const contract = await DutchAuctionCloser.new(ShortSell.address, ONE, TWO);
      const [ssAddress, num, den] = await Promise.all([
        contract.SHORT_SELL.call(),
        contract.callTimeLimitNumerator.call(),
        contract.callTimeLimitDenominator.call(),
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
      //TODO(brendanchou): validate token numbers
    });
  });
});
