/*global artifacts, web3, contract, describe, it, before, beforeEach*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const TokenizedShort = artifacts.require("TokenizedShort");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const { BIGNUMBERS, ADDRESSES } = require('../helpers/Constants');
const {
  callCloseShort,
  createSigned0xSellOrder,
  doShort,
  getShort,
  issueTokensAndSetAllowancesForClose,
  placeAuctionBid,
  issueTokenToAccountInAmountAndApproveProxy
} = require('../helpers/ShortSellHelper');
const { transact } = require('../helpers/ContractHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const {
  getTokenizedShortConstants,
  TOKENIZED_SHORT_STATE
} = require('../helpers/TokenizedShortHelper');
const { wait } = require('@digix/tempo')(web3);

contract('TokenizedShort', function(accounts) {
  const badId = web3.fromAscii("06231993");
  let baseToken, underlyingToken;

  function randomAccount() {
    return accounts[Math.floor(Math.random() * accounts.length)];
  }

  let SHORTS = {
    FULL: {
      TOKEN_CONTRACT: null,
      NAME: "Short that has never been partially closed",
      SYMBOL: "FULL",
      TX: null,
      ID: null,
      SELL_ORDER: null,
      NUM_TOKENS: 0,
      SALT: 0
    },
    PART: {
      TOKEN_CONTRACT: null,
      NAME: "Short that has been partially closed",
      SYMBOL: "PART",
      TX: null,
      ID: null,
      SELL_ORDER: null,
      NUM_TOKENS: 0,
      SALT: 0
    },
    CLSD: {
      TOKEN_CONTRACT: null,
      NAME: "Short that been fully closed",
      SYMBOL: "CLSD",
      TX: null,
      ID: null,
      SELL_ORDER: null,
      NUM_TOKENS: 0,
      SALT: 0
    }
  };
  const FULL_AND_PART = {FULL:0, PART:0};

  let CONTRACTS = {
    SHORT_SELL: null,
  }
  let pepper = 0;
  const INITIAL_TOKEN_HOLDER = accounts[9];

  before('Set up Proxy, ShortSell accounts', async () => {
    [
      CONTRACTS.SHORT_SELL,
      underlyingToken,
      baseToken,
    ] = await Promise.all([
      ShortSell.deployed(),
      UnderlyingToken.deployed(),
      BaseToken.deployed()
    ]);
  });

  async function setUpShorts() {
    pepper++;

    SHORTS.FULL.SALT = 222 + pepper;
    SHORTS.PART.SALT = 333 + pepper;
    SHORTS.CLSD.SALT = 444 + pepper;

    SHORTS.FULL.TX = await doShort(accounts.slice(1), SHORTS.FULL.SALT);
    SHORTS.PART.TX = await doShort(accounts.slice(2), SHORTS.PART.SALT);
    SHORTS.CLSD.TX = await doShort(accounts.slice(3), SHORTS.CLSD.SALT);

    expect(SHORTS.FULL.TX.seller).to.be.not.equal(SHORTS.PART.TX.seller);
    expect(SHORTS.PART.TX.seller).to.be.not.equal(SHORTS.CLSD.TX.seller);
    expect(SHORTS.CLSD.TX.seller).to.be.not.equal(SHORTS.FULL.TX.seller);

    [
      SHORTS.PART.SELL_ORDER,
      SHORTS.CLSD.SELL_ORDER
    ] = await Promise.all([
      createSigned0xSellOrder(accounts, SHORTS.PART.SALT),
      createSigned0xSellOrder(accounts, SHORTS.CLSD.SALT)
    ]);

    SHORTS.FULL.ID = SHORTS.FULL.TX.id;
    SHORTS.PART.ID = SHORTS.PART.TX.id;
    SHORTS.CLSD.ID = SHORTS.CLSD.TX.id;

    await Promise.all([
      issueTokensAndSetAllowancesForClose(SHORTS.PART.TX, SHORTS.PART.SELL_ORDER),
      issueTokensAndSetAllowancesForClose(SHORTS.CLSD.TX, SHORTS.CLSD.SELL_ORDER)
    ]);

    await Promise.all([
      callCloseShort(
        CONTRACTS.SHORT_SELL,
        SHORTS.PART.TX,
        SHORTS.PART.SELL_ORDER,
        SHORTS.PART.TX.shortAmount.div(2)),
      callCloseShort(
        CONTRACTS.SHORT_SELL,
        SHORTS.CLSD.TX,
        SHORTS.CLSD.SELL_ORDER,
        SHORTS.CLSD.TX.shortAmount)
    ]);
    SHORTS.FULL.NUM_TOKENS = SHORTS.FULL.TX.shortAmount;
    SHORTS.PART.NUM_TOKENS = SHORTS.PART.TX.shortAmount.div(2);
    SHORTS.CLSD.NUM_TOKENS = BIGNUMBERS.ZERO;
  }

  async function setUpShortTokens() {
    [
      SHORTS.FULL.TOKEN_CONTRACT,
      SHORTS.PART.TOKEN_CONTRACT,
      SHORTS.CLSD.TOKEN_CONTRACT
    ] = await Promise.all([
      TokenizedShort.new(
        CONTRACTS.SHORT_SELL.address,
        INITIAL_TOKEN_HOLDER,
        SHORTS.FULL.ID,
        SHORTS.FULL.NAME,
        SHORTS.FULL.SYMBOL),
      TokenizedShort.new(
        CONTRACTS.SHORT_SELL.address,
        INITIAL_TOKEN_HOLDER,
        SHORTS.PART.ID,
        SHORTS.PART.NAME,
        SHORTS.PART.SYMBOL),
      TokenizedShort.new(
        CONTRACTS.SHORT_SELL.address,
        INITIAL_TOKEN_HOLDER,
        SHORTS.CLSD.ID,
        SHORTS.CLSD.NAME,
        SHORTS.CLSD.SYMBOL)
    ]);
  }

  async function transferShortsToTokens() {
    await Promise.all([
      CONTRACTS.SHORT_SELL.transferShort(SHORTS.FULL.ID, SHORTS.FULL.TOKEN_CONTRACT.address,
        { from: SHORTS.FULL.TX.seller }),
      CONTRACTS.SHORT_SELL.transferShort(SHORTS.PART.ID, SHORTS.PART.TOKEN_CONTRACT.address,
        { from: SHORTS.PART.TX.seller })
    ]);
    const s1 = await getShort(CONTRACTS.SHORT_SELL, SHORTS.FULL.ID);
    const s2 = await getShort(CONTRACTS.SHORT_SELL, SHORTS.PART.ID);
    expect(s1.seller).to.be.equal(SHORTS.FULL.TOKEN_CONTRACT.address);
    expect(s2.seller).to.be.equal(SHORTS.PART.TOKEN_CONTRACT.address);
  }

  async function initializeTokens() {
    await Promise.all([
      SHORTS.FULL.TOKEN_CONTRACT.initialize({ from: randomAccount() }),
      SHORTS.PART.TOKEN_CONTRACT.initialize({ from: randomAccount() })
    ]);
  }

  async function returnTokensToSeller() {
    await Promise.all([
      SHORTS.FULL.TOKEN_CONTRACT.transfer(SHORTS.FULL.TX.seller, SHORTS.FULL.NUM_TOKENS,
        { from: INITIAL_TOKEN_HOLDER }),
      SHORTS.PART.TOKEN_CONTRACT.transfer(SHORTS.PART.TX.seller, SHORTS.PART.NUM_TOKENS,
        { from: INITIAL_TOKEN_HOLDER })
    ]);
  }

  async function grantDirectCloseTokensToSeller(act = null) {
    await issueTokenToAccountInAmountAndApproveProxy(
      underlyingToken,
      act ? act : SHORTS.FULL.TX.seller,
      SHORTS.FULL.NUM_TOKENS);
    await issueTokenToAccountInAmountAndApproveProxy(
      underlyingToken,
      act ? act : SHORTS.PART.TX.seller,
      SHORTS.PART.NUM_TOKENS);
  }

  async function callInShorts() {
    await Promise.all([
      CONTRACTS.SHORT_SELL.callInLoan(SHORTS.FULL.ID,
        { from : SHORTS.FULL.TX.loanOffering.lender }),
      CONTRACTS.SHORT_SELL.callInLoan(SHORTS.PART.ID,
        { from : SHORTS.PART.TX.loanOffering.lender }),
    ]);
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

    it('succeeds for full and PART shorts', async () => {
      await transferShortsToTokens();

      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        const tsc1 = await getTokenizedShortConstants(SHORT.TOKEN_CONTRACT);

        await SHORT.TOKEN_CONTRACT.initialize({ from: randomAccount() });

        const tsc2 = await getTokenizedShortConstants(SHORT.TOKEN_CONTRACT);
        const short = await getShort(CONTRACTS.SHORT_SELL, SHORT.ID);
        // expect certain values
        expect(tsc2.SHORT_SELL).to.equal(CONTRACTS.SHORT_SELL.address);
        expect(tsc2.shortId).to.equal(SHORT.ID);
        expect(tsc2.state.equals(TOKENIZED_SHORT_STATE.OPEN)).to.be.true;
        expect(tsc2.name).to.equal(SHORT.NAME);
        expect(tsc2.symbol).to.equal(SHORT.SYMBOL);
        expect(tsc2.initialTokenHolder).to.equal(INITIAL_TOKEN_HOLDER);
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
      }
    });

    it('fails for closed shorts', async () => {
      const SHORT = SHORTS.CLSD;
      // Even transfer will fail since the short should have been closed
      await expectThrow(
        () => CONTRACTS.SHORT_SELL.transferShort(SHORT.ID, SHORT.TOKEN_CONTRACT.address,
          { from: SHORT.TX.seller }));
      await expectThrow(
        () => SHORT.TOKEN_CONTRACT.initialize({ from: randomAccount() }));
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
      await expectThrow(() => tokenContract.initialize({ from: randomAccount() }));
    });

    it('fails if short seller is not assigned to be the token', async () => {
      for (let type in {FULL:0, PART:0}) {
        const SHORT = SHORTS[type];
        // transfer to random address (that is not the token contract)
        await CONTRACTS.SHORT_SELL.transferShort(SHORT.ID, ADDRESSES.TEST[8],
          { from: SHORT.TX.seller });
        await expectThrow(() => SHORT.TOKEN_CONTRACT.initialize({ from: randomAccount() }));
      }
    });

    it('fails if already initialized', async () => {
      await transferShortsToTokens();
      for (let type in {FULL:0, PART:0}) {
        const SHORT = SHORTS[type];
        await SHORT.TOKEN_CONTRACT.initialize({ from: randomAccount() }); // succeed
        await expectThrow(() => SHORT.TOKEN_CONTRACT.initialize({ from: randomAccount() })); // fail
      }
    });
  });

  describe('#closeOnBehalfOf', () => {
    it('fails if not authorized', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();
      await initializeTokens();

      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        const amount = SHORT.TX.shortAmount;
        await expectThrow(
          () => SHORT.TOKEN_CONTRACT.closeOnBehalfOf(
            seller, SHORT.ID, amount.div(2))
        );
      }
    });
  });

  describe('#closeOnBehalfOf via ShortSell#closeShortDirectly', () => {

    it('fails if not initialized', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();

      // give underlying tokens to token holder
      issueTokenToAccountInAmountAndApproveProxy(
        underlyingToken,
        INITIAL_TOKEN_HOLDER,
        SHORTS.FULL.NUM_TOKENS + SHORTS.PART.NUM_TOKENS);

      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        await expectThrow(
          () => CONTRACTS.SHORT_SELL.closeShortDirectly(
            SHORT.ID, SHORT.NUM_TOKENS, { from: INITIAL_TOKEN_HOLDER })
        );
      }
    });

    it('fails if user does not have the amount of underlyingToken required', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();
      await initializeTokens();
      await Promise.all([
        SHORTS.FULL.TOKEN_CONTRACT.transfer(accounts[0], SHORTS.FULL.NUM_TOKENS,
          { from: INITIAL_TOKEN_HOLDER }),
        SHORTS.PART.TOKEN_CONTRACT.transfer(accounts[0], SHORTS.PART.NUM_TOKENS,
          { from: INITIAL_TOKEN_HOLDER })
      ]);

      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        await expectThrow(
          () => CONTRACTS.SHORT_SELL.closeShortDirectly(
            SHORT.ID, SHORT.NUM_TOKENS, { from: SHORT.TX.seller })
        );
      }
    });

    it('fails if value is zero', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();
      await initializeTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        await expectThrow(
          () => CONTRACTS.SHORT_SELL.closeShortDirectly(
            SHORT.ID, 0, { from: SHORT.TX.seller })
        );
      }
    });

    it('closes up to the remainingAmount if user tries to close more', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();
      await initializeTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        await CONTRACTS.SHORT_SELL.closeShortDirectly(
          SHORT.ID, SHORT.NUM_TOKENS + 1, { from: SHORT.TX.seller });
      }
    });

    it('fails if (amount < remainingShort) but (amount > numTokens)', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();
      await initializeTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      const rando = accounts[9];

      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];

        // give away half of the short tokens
        await SHORT.TOKEN_CONTRACT.transfer(rando, SHORT.NUM_TOKENS.div(2),
          { from: SHORT.TX.seller });

        // can't close more than you have if you don't have all remaining tokens
        await expectThrow(
          () => CONTRACTS.SHORT_SELL.closeShortDirectly(
            SHORT.ID, SHORT.NUM_TOKENS.div(2) + 1, { from: SHORT.TX.seller })
        );

        // this amount is fine
        await CONTRACTS.SHORT_SELL.closeShortDirectly(
          SHORT.ID, SHORT.NUM_TOKENS.div(2), { from: SHORT.TX.seller })
      }
    });

    it('fails if user does not own any of the tokenized Short', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();
      await initializeTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller(accounts[0]);

      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        await expectThrow(
          () => CONTRACTS.SHORT_SELL.closeShortDirectly(
            SHORT.ID, SHORT.NUM_TOKENS, { from: accounts[0] })
        );
      }
    });

    it('fails if closed', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();
      await initializeTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        // do it once to close it
        await CONTRACTS.SHORT_SELL.closeShortDirectly(
          SHORT.ID, SHORT.NUM_TOKENS, { from: SHORT.TX.seller });

        // try again
        await expectThrow(
          () => CONTRACTS.SHORT_SELL.closeShortDirectly(
            SHORT.ID, SHORT.NUM_TOKENS, { from: SHORT.TX.seller })
        );
      }
    });

    it('succeeds otherwise', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();
      await initializeTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        await CONTRACTS.SHORT_SELL.closeShortDirectly(
          SHORT.ID, SHORT.NUM_TOKENS, { from: SHORT.TX.seller });
      }
    });
  });

  describe('#withdraw', () => {
    beforeEach('Set up all tokenized shorts and call-in shorts, waiting for calltimelimit',
      async () => {
        await setUpShorts();
        await setUpShortTokens();
        await transferShortsToTokens();
        await initializeTokens();
        await returnTokensToSeller();
        await wait(SHORTS.FULL.TX.loanOffering.maxDuration);
        await callInShorts();
        await wait(SHORTS.FULL.TX.loanOffering.callTimeLimit);
      }
    );

    it('fails when caller never had any tokens', async () => {
      // close half, force recover, then some random person can't withdraw any funds
      await grantDirectCloseTokensToSeller();
      const rando = accounts[9];
      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        const lender = SHORT.TX.loanOffering.lender;
        await CONTRACTS.SHORT_SELL.closeShortDirectly(
          SHORT.ID, SHORT.NUM_TOKENS.div(2), { from: seller });
        await CONTRACTS.SHORT_SELL.forceRecoverLoan(SHORT.ID, { from: lender });
        await expectThrow(() => SHORT.TOKEN_CONTRACT.withdraw(rando, { from: rando }));
      }
    });

    it('fails when short is completely closed', async () => {
      // close the short completely and then try to withdraw
      await grantDirectCloseTokensToSeller();
      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        const lender = SHORT.TX.loanOffering.lender;
        await CONTRACTS.SHORT_SELL.closeShortDirectly(
          SHORT.ID, SHORT.NUM_TOKENS, { from: seller });
        await expectThrow(() => CONTRACTS.SHORT_SELL.forceRecoverLoan(SHORT.ID, { from: lender }));
        await expectThrow(() => SHORT.TOKEN_CONTRACT.withdraw(seller, { from: seller }));
      }
    });

    it('fails when short is still open', async () => {
      // close short halfway and then try to withdraw
      await grantDirectCloseTokensToSeller();
      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        await CONTRACTS.SHORT_SELL.closeShortDirectly(
          SHORT.ID, SHORT.NUM_TOKENS.div(2), { from: seller });
        await expectThrow(() => SHORT.TOKEN_CONTRACT.withdraw(seller, { from: seller }));
      }
    });

    it('succeeds for normal operation', async () => {
      // close nothing, letting the lender forceRecoverLoan
      const bidder = accounts[9];
      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        const lender = SHORT.TX.loanOffering.lender;
        await placeAuctionBid(CONTRACTS.SHORT_SELL, underlyingToken, SHORT.TX, bidder, 100);
        await CONTRACTS.SHORT_SELL.forceRecoverLoan(SHORT.ID, { from: lender });

        const tokens1 = await baseToken.balanceOf.call(seller);

        const numWithdraw = await transact(SHORT.TOKEN_CONTRACT.withdraw, seller, { from: seller });
        expect(numWithdraw).to.be.bignumber.at.least(1);

        const tokens2 = await baseToken.balanceOf.call(seller);
        expect(tokens2).to.be.bignumber.equal(tokens1.plus(numWithdraw));
      }
    });

    it('succeeds when extra tokens have been deposited', async () => {
      // close nothing, letting the lender forceRecoverLoan
      const bidder = accounts[9];
      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        const lender = SHORT.TX.loanOffering.lender;
        await placeAuctionBid(CONTRACTS.SHORT_SELL, underlyingToken, SHORT.TX, bidder, 100);
        await CONTRACTS.SHORT_SELL.forceRecoverLoan(SHORT.ID, { from: lender });

        const tokens1 = await baseToken.balanceOf.call(seller);

        // get the amount we would have withdrawn
        const normalNumWithdraw =
          await SHORT.TOKEN_CONTRACT.withdraw.call(seller, { from: seller });
        expect(normalNumWithdraw).to.be.bignumber.at.least(1);

        // add extraTokens
        const numExtra = new BigNumber("123456789");
        await baseToken.issueTo(SHORT.TOKEN_CONTRACT.address, numExtra);

        // now we should have withdrawn everything
        const extendNumWithdraw =
          await transact(SHORT.TOKEN_CONTRACT.withdraw, seller, { from: seller });
        expect(extendNumWithdraw).to.be.bignumber.equal(normalNumWithdraw.plus(numExtra));

        const tokens2 = await baseToken.balanceOf.call(seller);
        expect(tokens2).to.be.bignumber.equal(tokens1.plus(extendNumWithdraw));
      }
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
      await transferShortsToTokens();
      await initializeTokens();
      for (let type in FULL_AND_PART) {
        const SHORT = SHORTS[type];
        const [decimal, expectedDecimal] = await Promise.all([
          SHORT.TOKEN_CONTRACT.decimals.call(),
          underlyingToken.decimals.call()
        ]);
        expect(decimal).to.be.bignumber.equal(expectedDecimal);
      }
    });
  });
});
