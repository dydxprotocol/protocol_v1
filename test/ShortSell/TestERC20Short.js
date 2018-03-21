/*global artifacts, web3, contract, describe, it, before, beforeEach*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const ShortSell = artifacts.require("ShortSell");
const ERC20Short = artifacts.require("ERC20Short");
const UnderlyingToken = artifacts.require("TokenB");
const { ADDRESSES } = require('../helpers/Constants');
const {
  callCloseShort,
  callCloseShortDirectly,
  doShort,
  getShort,
  issueTokensAndSetAllowancesForClose,
  issueTokenToAccountInAmountAndApproveProxy
} = require('../helpers/ShortSellHelper');
const {
  createSignedSellOrder
} = require('../helpers/0xHelper');
const { transact } = require('../helpers/ContractHelper');
const { expectThrow } = require('../helpers/ExpectHelper');
const { getBlockTimestamp } = require('../helpers/NodeHelper');
const {
  getERC20ShortConstants,
  TOKENIZED_SHORT_STATE
} = require('../helpers/ERC20ShortHelper');
const { wait } = require('@digix/tempo')(web3);
const BigNumber = require('bignumber.js');

contract('ERC20Short', function(accounts) {
  let underlyingToken

  let SHORTS = {
    FULL: {
      TOKEN_CONTRACT: null,
      TX: null,
      ID: null,
      SELL_ORDER: null,
      NUM_TOKENS: 0,
      SALT: 0
    },
    PART: {
      TOKEN_CONTRACT: null,
      TX: null,
      ID: null,
      SELL_ORDER: null,
      NUM_TOKENS: 0,
      SALT: 0
    }
  };

  let CONTRACTS = {
    SHORT_SELL: null,
  }
  let pepper = 0;
  const INITIAL_TOKEN_HOLDER = accounts[9];

  before('Set up Proxy, ShortSell accounts', async () => {
    [
      CONTRACTS.SHORT_SELL,
      underlyingToken
    ] = await Promise.all([
      ShortSell.deployed(),
      UnderlyingToken.deployed()
    ]);
  });

  async function setUpShorts() {
    pepper++;

    SHORTS.FULL.SALT = 222 + pepper;
    SHORTS.PART.SALT = 333 + pepper;

    SHORTS.FULL.TX = await doShort(accounts.slice(1), SHORTS.FULL.SALT);
    SHORTS.PART.TX = await doShort(accounts.slice(2), SHORTS.PART.SALT);

    expect(SHORTS.FULL.TX.seller).to.be.not.equal(SHORTS.PART.TX.seller);

    SHORTS.FULL.ID = SHORTS.FULL.TX.id;
    SHORTS.PART.ID = SHORTS.PART.TX.id;

    SHORTS.PART.SELL_ORDER = await createSignedSellOrder(accounts, SHORTS.PART.SALT);
    await issueTokensAndSetAllowancesForClose(SHORTS.PART.TX, SHORTS.PART.SELL_ORDER);
    await callCloseShort(
      CONTRACTS.SHORT_SELL,
      SHORTS.PART.TX,
      SHORTS.PART.SELL_ORDER,
      SHORTS.PART.TX.shortAmount.div(2));

    SHORTS.FULL.NUM_TOKENS = SHORTS.FULL.TX.shortAmount;
    SHORTS.PART.NUM_TOKENS = SHORTS.PART.TX.shortAmount.div(2);
  }

  async function setUpShortTokens() {
    [
      SHORTS.FULL.TOKEN_CONTRACT,
      SHORTS.PART.TOKEN_CONTRACT
    ] = await Promise.all([
      ERC20Short.new(
        SHORTS.FULL.ID,
        CONTRACTS.SHORT_SELL.address,
        INITIAL_TOKEN_HOLDER),
      ERC20Short.new(
        SHORTS.PART.ID,
        CONTRACTS.SHORT_SELL.address,
        INITIAL_TOKEN_HOLDER)
    ]);
  }

  async function transferShortsToTokens() {
    await Promise.all([
      CONTRACTS.SHORT_SELL.transferShort(SHORTS.FULL.ID, SHORTS.FULL.TOKEN_CONTRACT.address,
        { from: SHORTS.FULL.TX.seller }),
      CONTRACTS.SHORT_SELL.transferShort(SHORTS.PART.ID, SHORTS.PART.TOKEN_CONTRACT.address,
        { from: SHORTS.PART.TX.seller }),
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
    const requiredDeposit = new BigNumber(10);
    await Promise.all([
      CONTRACTS.SHORT_SELL.callInLoan(
        SHORTS.FULL.ID,
        requiredDeposit,
        { from : SHORTS.FULL.TX.loanOffering.lender }
      ),
      CONTRACTS.SHORT_SELL.callInLoan(
        SHORTS.PART.ID,
        requiredDeposit,
        { from : SHORTS.PART.TX.loanOffering.lender }
      ),
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
        const tsc = await getERC20ShortConstants(short.TOKEN_CONTRACT);
        expect(tsc.SHORT_SELL).to.equal(CONTRACTS.SHORT_SELL.address);
        expect(tsc.shortId).to.equal(short.ID);
        expect(tsc.state.equals(TOKENIZED_SHORT_STATE.UNINITIALIZED)).to.be.true;
        expect(tsc.initialTokenHolder).to.equal(INITIAL_TOKEN_HOLDER);
        expect(tsc.baseToken).to.equal(ADDRESSES.ZERO);
        expect(tsc.symbol).to.equal("DYDX-S");
        expect(tsc.name).to.equal("dYdx Tokenized Short [UNINITIALIZED]");
      }
    });
  });

  describe('#recieveShortOwnership', () => {
    beforeEach('set up new shorts and tokens', async () => {
      // Create new shorts since state is modified by transferring them
      await setUpShorts();
      await setUpShortTokens();
    });

    it('succeeds for FULL and PART shorts', async () => {
      for (let type in SHORTS) {
        const SHORT = SHORTS[type];

        const tsc1 = await getERC20ShortConstants(SHORT.TOKEN_CONTRACT);

        await CONTRACTS.SHORT_SELL.transferShort(SHORT.ID, SHORT.TOKEN_CONTRACT.address,
          { from: SHORT.TX.seller });

        const [tsc2, short] = await Promise.all([
          getERC20ShortConstants(SHORT.TOKEN_CONTRACT),
          getShort(CONTRACTS.SHORT_SELL, SHORT.ID)
        ]);

        // expect certain values
        expect(tsc2.SHORT_SELL).to.equal(CONTRACTS.SHORT_SELL.address);
        expect(tsc2.shortId).to.equal(SHORT.ID);
        expect(tsc2.state.equals(TOKENIZED_SHORT_STATE.OPEN)).to.be.true;
        expect(tsc2.initialTokenHolder).to.equal(INITIAL_TOKEN_HOLDER);
        expect(tsc2.baseToken).to.equal(short.baseToken);

        // explicity make sure some things have changed
        expect(tsc2.state.equals(tsc1.state)).to.be.false;
        expect(tsc2.baseToken).to.not.equal(tsc1.baseToken);

        // explicity make sure some things have not changed
        expect(tsc2.shortId).to.equal(tsc1.shortId);
        expect(tsc2.SHORT_SELL).to.equal(tsc1.SHORT_SELL);
        expect(tsc2.initialTokenHolder).to.equal(tsc1.initialTokenHolder);
      }
    });
  });

  describe('#closeOnBehalfOf', () => {
    it('fails if not authorized', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();

      for (let type in SHORTS) {
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

  describe('#closeOnBehalfOf via close short directly', () => {
    beforeEach('set up shorts and tokens', async () => {
      await setUpShorts();
      await setUpShortTokens();
    });

    it('fails if not transferred', async () => {
      // give underlying tokens to token holder
      issueTokenToAccountInAmountAndApproveProxy(
        underlyingToken,
        INITIAL_TOKEN_HOLDER,
        SHORTS.FULL.NUM_TOKENS + SHORTS.PART.NUM_TOKENS);

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        await expectThrow(
          () => callCloseShortDirectly(
            CONTRACTS.SHORT_SELL,
            SHORT.TX,
            SHORT.NUM_TOKENS,
            INITIAL_TOKEN_HOLDER)
        );
      }
    });

    it('fails if user does not have the amount of underlyingToken required', async () => {
      await transferShortsToTokens();
      await Promise.all([
        SHORTS.FULL.TOKEN_CONTRACT.transfer(accounts[0], SHORTS.FULL.NUM_TOKENS,
          { from: INITIAL_TOKEN_HOLDER }),
        SHORTS.PART.TOKEN_CONTRACT.transfer(accounts[0], SHORTS.PART.NUM_TOKENS,
          { from: INITIAL_TOKEN_HOLDER })
      ]);

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        await expectThrow(
          () => callCloseShortDirectly(
            CONTRACTS.SHORT_SELL,
            SHORT.TX,
            SHORT.NUM_TOKENS,
            SHORT.TX.seller
          )
        );
      }
    });

    it('fails if value is zero', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        await expectThrow(
          () => callCloseShortDirectly(
            CONTRACTS.SHORT_SELL,
            SHORT.TX,
            0,
            SHORT.TX.seller
          )
        );
      }
    });

    it('closes up to the remainingAmount if user tries to close more', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        await callCloseShortDirectly(
          CONTRACTS.SHORT_SELL,
          SHORT.TX,
          SHORT.NUM_TOKENS + 1,
          SHORT.TX.seller
        );
      }
    });

    it('closes at most the number of tokens owned', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      const rando = accounts[9];

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];

        // give away half of the short tokens
        await SHORT.TOKEN_CONTRACT.transfer(rando, SHORT.NUM_TOKENS.div(2),
          { from: SHORT.TX.seller });

        // try to close with too-large amount, but it will get bounded by the number of tokens owned
        const result = await transact(CONTRACTS.SHORT_SELL.closeShort,
          SHORT.ID, SHORT.NUM_TOKENS.times(10), ADDRESSES.ZERO, "", { from: SHORT.TX.seller })
        expect(result[0] /* amountClosed */).to.be.bignumber.equal(SHORT.NUM_TOKENS.div(2));
      }
    });

    it('fails if user does not own any of the tokenized Short', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller(accounts[0]);

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        await expectThrow(
          () => callCloseShortDirectly(
            CONTRACTS.SHORT_SELL,
            SHORT.TX,
            SHORT.NUM_TOKENS,
            accounts[0]
          )
        );
      }
    });

    it('fails if closed', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        // do it once to close it
        await callCloseShortDirectly(
          CONTRACTS.SHORT_SELL,
          SHORT.TX,
          SHORT.NUM_TOKENS,
          SHORT.TX.seller
        );

        // try again
        await expectThrow(
          () => callCloseShortDirectly(
            CONTRACTS.SHORT_SELL,
            SHORT.TX,
            SHORT.NUM_TOKENS,
            SHORT.TX.seller
          )
        );
      }
    });

    it('succeeds otherwise', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        await callCloseShortDirectly(
          CONTRACTS.SHORT_SELL,
          SHORT.TX,
          SHORT.NUM_TOKENS
        );
      }
    });
  });

  describe('#withdraw', () => {
    beforeEach('Set up all tokenized shorts and call-in shorts, waiting for calltimelimit',
      async () => {
        await setUpShorts();
        await setUpShortTokens();
        await transferShortsToTokens();
        await returnTokensToSeller();
        const startTime = await getBlockTimestamp(SHORTS.FULL.TX.response.receipt.blockNumber);
        const endTime = SHORTS.FULL.TX.loanOffering.endDate;
        const loanTime = endTime - startTime;
        await wait(loanTime);
        await callInShorts();
        await wait(SHORTS.FULL.TX.loanOffering.callTimeLimit);
      }
    );

    it('fails when caller never had any tokens', async () => {
      // close half, force recover, then some random person can't withdraw any funds
      await grantDirectCloseTokensToSeller();
      const rando = accounts[9];
      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        const lender = SHORT.TX.loanOffering.lender;
        await callCloseShortDirectly(
          CONTRACTS.SHORT_SELL,
          SHORT.TX,
          SHORT.NUM_TOKENS.div(2)
        );
        await CONTRACTS.SHORT_SELL.forceRecoverLoan(SHORT.ID, { from: lender });
        await expectThrow(() => SHORT.TOKEN_CONTRACT.withdraw(rando, { from: rando }));
      }
    });

    it('fails when short is completely closed', async () => {
      // close the short completely and then try to withdraw
      await grantDirectCloseTokensToSeller();
      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        const lender = SHORT.TX.loanOffering.lender;
        await callCloseShortDirectly(
          CONTRACTS.SHORT_SELL,
          SHORT.TX,
          SHORT.NUM_TOKENS
        );
        await expectThrow(() => CONTRACTS.SHORT_SELL.forceRecoverLoan(SHORT.ID, { from: lender }));
        await expectThrow(() => SHORT.TOKEN_CONTRACT.withdraw(seller, { from: seller }));
      }
    });

    it('fails when short is still open', async () => {
      // close short halfway and then try to withdraw
      await grantDirectCloseTokensToSeller();
      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        await callCloseShortDirectly(
          CONTRACTS.SHORT_SELL,
          SHORT.TX,
          SHORT.NUM_TOKENS.div(2)
        );
        await expectThrow(() => SHORT.TOKEN_CONTRACT.withdraw(seller, { from: seller }));
      }
    });

    it('withdraws no tokens after forceRecoverLoan', async () => {
      // close nothing, letting the lender forceRecoverLoan
      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        const seller = SHORT.TX.seller;
        const lender = SHORT.TX.loanOffering.lender;

        await CONTRACTS.SHORT_SELL.forceRecoverLoan(SHORT.ID, { from: lender });

        const numWithdraw = await transact(SHORT.TOKEN_CONTRACT.withdraw, seller, { from: seller });
        expect(numWithdraw).to.be.bignumber.equal(0);
      }
    });
  });

  describe('#decimals', () => {
    it('returns decimal value of underlyingToken', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        const [decimal, expectedDecimal] = await Promise.all([
          SHORT.TOKEN_CONTRACT.decimals.call(),
          underlyingToken.decimals.call()
        ]);
        expect(decimal).to.be.bignumber.equal(expectedDecimal);
      }
    });

    it('returns decimal value of underlyingToken, even if not initialized', async () => {
      await setUpShorts();
      const tokenContract = await ERC20Short.new(
        SHORTS.FULL.ID,
        CONTRACTS.SHORT_SELL.address,
        INITIAL_TOKEN_HOLDER);
      const [decimal, expectedDecimal] = await Promise.all([
        tokenContract.decimals.call(),
        underlyingToken.decimals.call()
      ]);
      expect(decimal).to.be.bignumber.equal(expectedDecimal);
    });
  });

  describe('#name', () => {
    it('successfully returns the shortId of the short', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();

      for (let type in SHORTS) {
        const SHORT = SHORTS[type];
        const [shortId, shortName] = await Promise.all([
          SHORT.TOKEN_CONTRACT.SHORT_ID.call(),
          SHORT.TOKEN_CONTRACT.name.call()
        ]);
        expect(shortId).to.be.bignumber.equal(SHORT.ID);
        expect(shortName).to.be.equal("dYdX Tokenized Short " + SHORT.ID.toString());
      }
    });
  });
});
