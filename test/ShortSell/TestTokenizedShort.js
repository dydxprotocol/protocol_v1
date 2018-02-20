/*global artifacts, web3, contract, describe, it, before, beforeEach*/

const Web3 = require('web3');
const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const TokenizedShort = artifacts.require("TokenizedShort");
const TokenizedShortCreator = artifacts.require("TokenizedShortCreator");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const { ADDRESSES, BIGNUMBERS } = require('../helpers/Constants');
const {
  callCloseShort,
  createSigned0xSellOrder,
  doShort,
  getShort,
  issueTokensAndSetAllowancesForClose
} = require('../helpers/ShortSellHelper');
const { transact } = require('../helpers/ContractHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const {
  getTokenizedShortConstants,
  TOKENIZED_SHORT_STATE
} = require('../helpers/TokenizedShortHelper');

contract('TokenizedShort', function(accounts) {
  const badId = web3.fromAscii("06231993");

  let SHORTS = {
    FULL: {
      TOKEN_CONTRACT: null,
      NAME: "Short that has never been partially closed",
      SYMBOL: "FULL",
      TX: null,
      ID: null,
      SELL_ORDER: null
    },
    PARTIAL: {
      TOKEN_CONTRACT: null,
      NAME: "Short that has been partially closed",
      SYMBOL: "PARTIAL",
      TX: null,
      ID: null,
      SELL_ORDER: null
    },
    CLOSED: {
      TOKEN_CONTRACT: null,
      NAME: "Short that been fully closed",
      SYMBOL: "CLOSED",
      TX: null,
      ID: null,
      SELL_ORDER: null
    }
  };
  const FULL_AND_PARTIAL = ['FULL', 'PARTIAL'];

  let CONTRACTS = {
    PROXY: null,
    SHORT_SELL: null,
    TOKENIZED_SHORT_CREATOR: null
  }
  let pepper = 0;
  const INITIAL_TOKEN_HOLDER = accounts[9];

  before('Set up Proxy, ShortSell, and TokenizedShortCreator accounts', async () => {
    [
      CONTRACTS.SHORT_SELL,
      CONTRACTS.TOKENIZED_SHORT_CREATOR
    ] = await Promise.all([
      ShortSell.deployed(),
      TokenizedShortCreator.deployed()
    ]);
  });

  async function setUpShorts() {
    let salt = 0;
    pepper++;

    salt = 222 + pepper;
    SHORTS.FULL.TX = await doShort(accounts, salt);
    SHORTS.FULL.ID = SHORTS.FULL.TX.id;

    salt = 333 + pepper;
    SHORTS.PARTIAL.TX = await doShort(accounts, salt);
    SHORTS.PARTIAL.ID = SHORTS.PARTIAL.TX.id;
    SHORTS.PARTIAL.SELL_ORDER = await createSigned0xSellOrder(accounts, salt);
    await issueTokensAndSetAllowancesForClose(SHORTS.PARTIAL.TX, SHORTS.PARTIAL.SELL_ORDER);
    await callCloseShort(
      CONTRACTS.SHORT_SELL,
      SHORTS.PARTIAL.TX,
      SHORTS.PARTIAL.SELL_ORDER,
      SHORTS.PARTIAL.TX.shortAmount.div(new BigNumber(2)));

    salt = 444 + pepper;
    SHORTS.CLOSED.TX = await doShort(accounts, salt);
    SHORTS.CLOSED.ID = SHORTS.CLOSED.TX.id;
    SHORTS.CLOSED.SELL_ORDER = await createSigned0xSellOrder(accounts, salt);
    await issueTokensAndSetAllowancesForClose(SHORTS.CLOSED.TX, SHORTS.CLOSED.SELL_ORDER);
    await callCloseShort(
      CONTRACTS.SHORT_SELL,
      SHORTS.CLOSED.TX,
      SHORTS.CLOSED.SELL_ORDER,
      SHORTS.CLOSED.TX.shortAmount);
  }

  async function setUpShortTokens() {
    for (let type in SHORTS) {
      const SHORT = SHORTS[type];
      SHORT.TOKEN_CONTRACT = await TokenizedShort.new(
        CONTRACTS.SHORT_SELL.address,
        INITIAL_TOKEN_HOLDER,
        SHORT.ID,
        SHORT.NAME,
        SHORT.SYMBOL);
    }
  }

  describe('Constructor', () => {
    before('set up shorts and tokens', async () => {
      await setUpShorts();
      await setUpShortTokens();
    });

    it('sets constants correctly', async () => {
      for (let type in SHORTS) {
        const short = SHORTS[type];
        const tsc = await getTokenizedShortConstants(short.TOKEN_CONTRACT);
        expect(tsc.SHORT_SELL).to.equal(CONTRACTS.SHORT_SELL.address);
        expect(tsc.shortId).to.equal(short.ID);
        expect(tsc.state.equals(TOKENIZED_SHORT_STATE.UNINITIALIZED)).to.be.true;
        expect(tsc.name).to.equal(short.NAME);
        expect(tsc.symbol).to.equal(short.SYMBOL);
        expect(tsc.initialTokenHolder).to.equal(INITIAL_TOKEN_HOLDER);
        expect(tsc.redeemed.equals(BIGNUMBERS.ZERO)).to.be.true;
        expect(tsc.baseToken).to.equal(ADDRESSES.ZERO);
      }
    });

    it('succeeds even if there already exists a token for the short', async () => {
      const tokenHolder2 = ADDRESSES.TEST[8];
      const name2 = "PEPPA";
      const symbol2 = "XPP";
      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        const secondContract = await TokenizedShort.new(
          CONTRACTS.SHORT_SELL.address,
          tokenHolder2,
          SHORT.ID,
          name2,
          symbol2);
        const tsc = await getTokenizedShortConstants(secondContract);
        expect(tsc.SHORT_SELL).to.equal(CONTRACTS.SHORT_SELL.address);
        expect(tsc.shortId).to.equal(SHORT.ID);
        expect(tsc.state.equals(TOKENIZED_SHORT_STATE.UNINITIALIZED)).to.be.true;
        expect(tsc.name).to.equal(name2);
        expect(tsc.symbol).to.equal(symbol2);
        expect(tsc.initialTokenHolder).to.equal(tokenHolder2);
        expect(tsc.redeemed.equals(BIGNUMBERS.ZERO)).to.be.true;
        expect(tsc.baseToken).to.equal(ADDRESSES.ZERO);
        expect(SHORT.TOKEN_CONTRACT.address).to.not.equal(secondContract.address);
      }
    })
  });

  describe('#initialize', () => {
    beforeEach('set up new shorts and tokens', async () => {
      // we need new shorts since we are modifying their state by transferring them
      await setUpShorts();
      await setUpShortTokens();
    });

    it('succeeds for full and partial shorts', async () => {
      for (let type in FULL_AND_PARTIAL) {
        const SHORT = SHORTS[type];
        const tsc1 = await getTokenizedShortConstants(SHORT.TOKEN_CONTRACT);
        await CONTRACTS.SHORT_SELL.transferShort(SHORT.ID, SHORT.TOKEN_CONTRACT.address);
        await SHORT.TOKEN_CONTRACT.initialize({ from: accounts[9] });
        const tsc2 = await getTokenizedShortConstants(SHORT.TOKEN_CONTRACT);
        const short = await getShort(CONTRACTS.SHORT_SELL, SHORT.ID);
        // expect certain values
        expect(tsc2.SHORT_SELL).to.equal(CONTRACTS.SHORT_SELL.address);
        expect(tsc2.shortId).to.equal(SHORT.ID);
        expect(tsc2.state.equals(TOKENIZED_SHORT_STATE.OPEN)).to.be.true;
        expect(tsc2.name).to.equal(SHORT.NAME);
        expect(tsc2.symbol).to.equal(SHORT.SYMBOL);
        expect(tsc2.initialTokenHolder).to.equal(INITIAL_TOKEN_HOLDER);
        expect(tsc2.redeemed.equals(BIGNUMBERS.ZERO)).to.be.true;
        expect(tsc2.baseToken).to.equal(short.baseToken);

        // explicity make sure some things have changed
        expect(tsc2.state.equals(tsc1.state)).to.be.false;
        expect(tsc2.baseToken).to.not.equal(tsc1.baseToken);

        // explicity make sure some things have not changed
        expect(tsc2.SHORT_SELL).to.equal(tsc1.SHORT_SELL);
        expect(tsc2.shortId).to.equal(tsc1.shortId);
        expect(tsc2.name).to.equal(tsc1.name);
        expect(tsc2.symbol).to.equal(tsc1.symbol);
        expect(tsc2.initialTokenHolder).to.equal(tsc1.initialTokenHolder);
        expect(tsc2.redeemed.equals(tsc1.redeemed)).to.be.true;
      }
    });

    it('fails for closed shorts', async () => {
      const SHORT = SHORTS.CLOSED;
      // Even transfer will fail since the short should have been closed
      await expectThrow(
        () => CONTRACTS.SHORT_SELL.transferShort(SHORT.ID, SHORT.TOKEN_CONTRACT.address));
      await expectThrow(
        () => SHORT.TOKEN_CONTRACT.initialize({ from: accounts[9] }));
    });

    it('fails if short has invalid id', async () => {
      const tokenContract = await TokenizedShort.new(
        CONTRACTS.SHORT_SELL.address,
        INITIAL_TOKEN_HOLDER,
        badId,
        "NewName",
        "NAM");
      // Even transfer will fail since the shortId is invalid
      await expectThrow(() => CONTRACTS.SHORT_SELL.transferShort(badId, tokenContract.address));
      await expectThrow(() => tokenContract.initialize({ from: accounts[9] }));
    });

    it('fails if short seller is not assigned to be the token', async () => {
      for (let type in {FULL:0, PARTIAL:0}) {
        const SHORT = SHORTS[type];
        // transfer to random address (that is not the token contract)
        await CONTRACTS.SHORT_SELL.transferShort(SHORT.ID, ADDRESSES.TEST[8]);
        await expectThrow(() => SHORT.TOKEN_CONTRACT.initialize({ from: accounts[9] }));
      }
    });

    it('fails if already initialized', async () => {
      for (let type in {FULL:0, PARTIAL:0}) {
        const SHORT = SHORTS[type];
        await CONTRACTS.SHORT_SELL.transferShort(SHORT.ID, SHORT.TOKEN_CONTRACT.address);
        await SHORT.TOKEN_CONTRACT.initialize({ from: accounts[8] }); // succeed
        await expectThrow(() => SHORT.TOKEN_CONTRACT.initialize({ from: accounts[9] })); // fail
      }
    });
  });

  describe('#closeOnBehalfOf', () => {
    let baseToken, underlyingToken, feeToken;

    beforeEach('set up shorts and short tokens', async () => {
      await setUpShorts();
      await setUpShortTokens();

      [baseToken, underlyingToken, feeToken] = await Promise.all([
        BaseToken.deployed(),
        UnderlyingToken.deployed(),
        FeeToken.deployed()
      ]);
      for (let type in FULL_AND_PARTIAL) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        const amount = SHORT.TX.shortAmount;
        underlyingToken.issueTo(seller, amount);
        SHORT.TOKEN_CONTRACT.transfer(seller, amount, { from: INITIAL_TOKEN_HOLDER });
      }
    });

    it('fails if not initialized', async () => {
      for (let type in FULL_AND_PARTIAL) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        const amount = SHORT.TX.shortAmount;
        await expectThrow(
          () => SHORT.TOKEN_CONTRACT.closeOnBehalfOf(
            seller, SHORT.ID, amount.div(2))
        );
      }
    });

    it('fails if closed', async () => {
      for (let type in FULL_AND_PARTIAL) {
        const SHORT = SHORTS[type];
        await SHORT.TOKEN_CONTRACT.initialize();
      }
    });

    it('fails if value is zero', async () => {
      for (let type in FULL_AND_PARTIAL) {
        const SHORT = SHORTS[type];
        await SHORT.TOKEN_CONTRACT.initialize();
      }
    });

    it('fails if value is too high', async () => {
      for (let type in FULL_AND_PARTIAL) {
        const SHORT = SHORTS[type];
        await SHORT.TOKEN_CONTRACT.initialize();
      }
    });

    it('fails if user does not have the amount of underlyingToken required', async () => {
      for (let type in FULL_AND_PARTIAL) {
        const SHORT = SHORTS[type];
        await SHORT.TOKEN_CONTRACT.initialize();
      }
    });
  });

  describe('#closeOnBehalfOf', () => {
    before('', async () => {

    });

    beforeEach('', async () => {

    });

    it('fails if not initialized', async () => {

    });
  });

  describe('#withdraw', () => {
    before('', async () => {

    });

    beforeEach('', async () => {

    });

    it('fails for zero balance', async () => {

    });
  });

  describe('#decimals', () => {
    it('fails for invalid shortId', async () => {
      const name = "Hello this is my name";
      const symbol = "HEL";
      const tokenContract = await TokenizedShort.new(
        CONTRACTS.SHORT_SELL.address,
        INITIAL_TOKEN_HOLDER,
        badId,
        name,
        symbol);
      await expectThrow(() => tokenContract.decimals());
    });

    it('successfully returns decimal value of underlyingToken', async () => {
      await setUpShorts();
      await setUpShortTokens();

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        const decimal = await SHORT.TOKEN_CONTRACT.decimals.call();
        expect(decimal).to.be.bignumber.equal(15);
      }
    });
  });
});
