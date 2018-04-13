/*global artifacts, web3, contract, describe, it, before, beforeEach*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const Margin = artifacts.require("Margin");
const ERC20Short = artifacts.require("ERC20Short");
const BaseToken = artifacts.require("TokenB");
const { ADDRESSES } = require('../../helpers/Constants');
const {
  callClosePosition,
  callClosePositionDirectly,
  doShort,
  getPosition,
  issueTokensAndSetAllowancesForClose,
  issueTokenToAccountInAmountAndApproveProxy,
  getMaxInterestFee
} = require('../../helpers/MarginHelper');
const {
  createSignedSellOrder
} = require('../../helpers/0xHelper');
const { transact } = require('../../helpers/ContractHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');
const {
  getERC20ShortConstants,
  TOKENIZED_POSITION_STATE
} = require('../../helpers/ERC20ShortHelper');
const { wait } = require('@digix/tempo')(web3);
const BigNumber = require('bignumber.js');

contract('ERC20Short', function(accounts) {
  let baseToken;

  let POSITIONS = {
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
    MARGIN: null,
  }
  let pepper = 0;
  const INITIAL_TOKEN_HOLDER = accounts[9];

  before('Set up Proxy, Margin accounts', async () => {
    [
      CONTRACTS.MARGIN,
      baseToken
    ] = await Promise.all([
      Margin.deployed(),
      BaseToken.deployed()
    ]);
  });

  async function setUpShorts() {
    pepper++;

    POSITIONS.FULL.SALT = 222 + pepper;
    POSITIONS.PART.SALT = 333 + pepper;

    POSITIONS.FULL.TX = await doShort(accounts.slice(1), POSITIONS.FULL.SALT);
    POSITIONS.PART.TX = await doShort(accounts.slice(2), POSITIONS.PART.SALT);

    expect(POSITIONS.FULL.TX.seller).to.be.not.equal(POSITIONS.PART.TX.seller);

    POSITIONS.FULL.ID = POSITIONS.FULL.TX.id;
    POSITIONS.PART.ID = POSITIONS.PART.TX.id;

    POSITIONS.PART.SELL_ORDER = await createSignedSellOrder(accounts, POSITIONS.PART.SALT);
    await issueTokensAndSetAllowancesForClose(POSITIONS.PART.TX, POSITIONS.PART.SELL_ORDER);
    await callClosePosition(
      CONTRACTS.MARGIN,
      POSITIONS.PART.TX,
      POSITIONS.PART.SELL_ORDER,
      POSITIONS.PART.TX.shortAmount.div(2));

    POSITIONS.FULL.NUM_TOKENS = POSITIONS.FULL.TX.shortAmount;
    POSITIONS.PART.NUM_TOKENS = POSITIONS.PART.TX.shortAmount.div(2);
  }

  async function setUpShortTokens() {
    POSITIONS.FULL.TRUSTED_RECIPIENTS = [ADDRESSES.TEST[1], ADDRESSES.TEST[2]];
    POSITIONS.PART.TRUSTED_RECIPIENTS = [ADDRESSES.TEST[3], ADDRESSES.TEST[4]];
    [
      POSITIONS.FULL.TOKEN_CONTRACT,
      POSITIONS.PART.TOKEN_CONTRACT
    ] = await Promise.all([
      ERC20Short.new(
        POSITIONS.FULL.ID,
        CONTRACTS.MARGIN.address,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.FULL.TRUSTED_RECIPIENTS),
      ERC20Short.new(
        POSITIONS.PART.ID,
        CONTRACTS.MARGIN.address,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.PART.TRUSTED_RECIPIENTS)
    ]);
  }

  async function transferShortsToTokens() {
    await Promise.all([
      CONTRACTS.MARGIN.transferShort(POSITIONS.FULL.ID, POSITIONS.FULL.TOKEN_CONTRACT.address,
        { from: POSITIONS.FULL.TX.seller }),
      CONTRACTS.MARGIN.transferShort(POSITIONS.PART.ID, POSITIONS.PART.TOKEN_CONTRACT.address,
        { from: POSITIONS.PART.TX.seller }),
    ]);
  }

  async function returnTokensToSeller() {
    await Promise.all([
      POSITIONS.FULL.TOKEN_CONTRACT.transfer(POSITIONS.FULL.TX.seller, POSITIONS.FULL.NUM_TOKENS,
        { from: INITIAL_TOKEN_HOLDER }),
      POSITIONS.PART.TOKEN_CONTRACT.transfer(POSITIONS.PART.TX.seller, POSITIONS.PART.NUM_TOKENS,
        { from: INITIAL_TOKEN_HOLDER })
    ]);
  }

  async function grantDirectCloseTokensToSeller(act = null) {
    const maxInterestFull = await getMaxInterestFee(POSITIONS.FULL.TX);
    const maxInterestPart = await getMaxInterestFee(POSITIONS.PART.TX);
    await issueTokenToAccountInAmountAndApproveProxy(
      baseToken,
      act ? act : POSITIONS.FULL.TX.seller,
      POSITIONS.FULL.NUM_TOKENS.plus(maxInterestFull));
    await issueTokenToAccountInAmountAndApproveProxy(
      baseToken,
      act ? act : POSITIONS.PART.TX.seller,
      POSITIONS.PART.NUM_TOKENS.plus(maxInterestPart));
  }

  async function callInShorts() {
    const requiredDeposit = new BigNumber(10);
    await Promise.all([
      CONTRACTS.MARGIN.callInLoan(
        POSITIONS.FULL.ID,
        requiredDeposit,
        { from : POSITIONS.FULL.TX.loanOffering.payer }
      ),
      CONTRACTS.MARGIN.callInLoan(
        POSITIONS.PART.ID,
        requiredDeposit,
        { from : POSITIONS.PART.TX.loanOffering.payer }
      ),
    ]);
  }

  describe('Constructor', () => {
    before('set up shorts and tokens', async () => {
      await setUpShorts();
      await setUpShortTokens();
    });

    it('sets constants correctly', async () => {
      for (let type in POSITIONS) {
        const position = POSITIONS[type];
        const tsc = await getERC20ShortConstants(position.TOKEN_CONTRACT);
        expect(tsc.MARGIN).to.equal(CONTRACTS.MARGIN.address);
        expect(tsc.MARGIN_ID).to.equal(position.ID);
        expect(tsc.state.equals(TOKENIZED_POSITION_STATE.UNINITIALIZED)).to.be.true;
        expect(tsc.INITIAL_TOKEN_HOLDER).to.equal(INITIAL_TOKEN_HOLDER);
        expect(tsc.quoteToken).to.equal(ADDRESSES.ZERO);
        expect(tsc.symbol).to.equal("DYDX-S");
        expect(tsc.name).to.equal("dYdX Tokenized Short [UNINITIALIZED]");
        for (let i in position.TRUSTED_RECIPIENTS) {
          const recipient = position.TRUSTED_RECIPIENTS[i];
          const isIn = await position.TOKEN_CONTRACT.TRUSTED_RECIPIENTS.call(recipient);
          expect(isIn).to.be.true;
        }
        const hasZero = await position.TOKEN_CONTRACT.TRUSTED_RECIPIENTS.call(ADDRESSES.ZERO);
        expect(hasZero).to.be.false;
      }
    });
  });

  describe('#receivePositionOwnership', () => {
    beforeEach('set up new shorts and tokens', async () => {
      // Create new shorts since state is modified by transferring them
      await setUpShorts();
      await setUpShortTokens();
    });

    it('succeeds for FULL and PART shorts', async () => {
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        const tsc1 = await getERC20ShortConstants(POSITION.TOKEN_CONTRACT);

        await CONTRACTS.MARGIN.transferShort(POSITION.ID, POSITION.TOKEN_CONTRACT.address,
          { from: POSITION.TX.seller });

        const [tsc2, position] = await Promise.all([
          getERC20ShortConstants(POSITION.TOKEN_CONTRACT),
          getPosition(CONTRACTS.MARGIN, POSITION.ID)
        ]);

        // expect certain values
        expect(tsc2.MARGIN).to.equal(CONTRACTS.MARGIN.address);
        expect(tsc2.MARGIN_ID).to.equal(POSITION.ID);
        expect(tsc2.state.equals(TOKENIZED_POSITION_STATE.OPEN)).to.be.true;
        expect(tsc2.INITIAL_TOKEN_HOLDER).to.equal(INITIAL_TOKEN_HOLDER);
        expect(tsc2.quoteToken).to.equal(position.quoteToken);

        // explicity make sure some things have changed
        expect(tsc2.state.equals(tsc1.state)).to.be.false;
        expect(tsc2.quoteToken).to.not.equal(tsc1.quoteToken);

        // explicity make sure some things have not changed
        expect(tsc2.MARGIN_ID).to.equal(tsc1.MARGIN_ID);
        expect(tsc2.MARGIN).to.equal(tsc1.MARGIN);
        expect(tsc2.INITIAL_TOKEN_HOLDER).to.equal(tsc1.INITIAL_TOKEN_HOLDER);
      }
    });
  });

  describe('#closeOnBehalfOf', () => {
    it('fails if not authorized', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const seller = POSITION.TX.seller;
        const amount = POSITION.TX.shortAmount;
        await expectThrow(
          POSITION.TOKEN_CONTRACT.closeOnBehalfOf(
            seller, seller, POSITION.ID, amount.div(2))
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
      // give base tokens to token holder
      issueTokenToAccountInAmountAndApproveProxy(
        baseToken,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.FULL.NUM_TOKENS + POSITIONS.PART.NUM_TOKENS);

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await expectThrow(
          callClosePositionDirectly(
            CONTRACTS.MARGIN,
            POSITION.TX,
            POSITION.NUM_TOKENS,
            INITIAL_TOKEN_HOLDER)
        );
      }
    });

    it('fails if user does not have the amount of baseToken required', async () => {
      await transferShortsToTokens();
      await Promise.all([
        POSITIONS.FULL.TOKEN_CONTRACT.transfer(accounts[0], POSITIONS.FULL.NUM_TOKENS,
          { from: INITIAL_TOKEN_HOLDER }),
        POSITIONS.PART.TOKEN_CONTRACT.transfer(accounts[0], POSITIONS.PART.NUM_TOKENS,
          { from: INITIAL_TOKEN_HOLDER })
      ]);

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await expectThrow(
          callClosePositionDirectly(
            CONTRACTS.MARGIN,
            POSITION.TX,
            POSITION.NUM_TOKENS,
            POSITION.TX.seller
          )
        );
      }
    });

    it('fails if value is zero', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await expectThrow(
          callClosePositionDirectly(
            CONTRACTS.MARGIN,
            POSITION.TX,
            0,
            POSITION.TX.seller
          )
        );
      }
    });

    it('closes up to the remainingAmount if user tries to close more', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await callClosePositionDirectly(
          CONTRACTS.MARGIN,
          POSITION.TX,
          POSITION.NUM_TOKENS + 1,
          POSITION.TX.seller
        );
      }
    });

    it('closes at most the number of tokens owned', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      const rando = accounts[9];

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        // give away half of the short tokens
        await POSITION.TOKEN_CONTRACT.transfer(rando, POSITION.NUM_TOKENS.div(2),
          { from: POSITION.TX.seller });

        // try to close with too-large amount, but it will get bounded by the number of tokens owned
        const tx = await callClosePositionDirectly(
          CONTRACTS.MARGIN,
          POSITION.TX,
          POSITION.NUM_TOKENS.times(10)
        );
        expect(tx.result[0] /* amountClosed */).to.be.bignumber.equal(POSITION.NUM_TOKENS.div(2));
      }
    });

    it('fails if user does not own any of the tokenized Short', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller(accounts[0]);

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await expectThrow(
          callClosePositionDirectly(
            CONTRACTS.MARGIN,
            POSITION.TX,
            POSITION.NUM_TOKENS,
            accounts[0]
          )
        );
      }
    });

    it('fails if closed', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        // do it once to close it
        await callClosePositionDirectly(
          CONTRACTS.MARGIN,
          POSITION.TX,
          POSITION.NUM_TOKENS,
          POSITION.TX.seller
        );

        // try again
        await expectThrow(
          callClosePositionDirectly(
            CONTRACTS.MARGIN,
            POSITION.TX,
            POSITION.NUM_TOKENS,
            POSITION.TX.seller
          )
        );
      }
    });

    it('succeeds otherwise', async () => {
      await transferShortsToTokens();
      await returnTokensToSeller();
      await grantDirectCloseTokensToSeller();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await callClosePositionDirectly(
          CONTRACTS.MARGIN,
          POSITION.TX,
          POSITION.NUM_TOKENS
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
        await callInShorts();
        await wait(POSITIONS.FULL.TX.loanOffering.callTimeLimit);
      }
    );

    it('returns 0 when caller never had any tokens', async () => {
      // close half, force recover, then some random person can't withdraw any funds
      await grantDirectCloseTokensToSeller();
      const rando = accounts[9];
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const lender = POSITION.TX.loanOffering.payer;
        await callClosePositionDirectly(
          CONTRACTS.MARGIN,
          POSITION.TX,
          POSITION.NUM_TOKENS.div(2)
        );
        await CONTRACTS.MARGIN.forceRecoverLoan(POSITION.ID, { from: lender });
        const tx = await transact(POSITION.TOKEN_CONTRACT.withdraw, rando, { from: rando });

        expect(tx.result).to.be.bignumber.eq(0);
      }
    });

    it('returns 0 when short is completely closed', async () => {
      // close the short completely and then try to withdraw
      await grantDirectCloseTokensToSeller();
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const seller = POSITION.TX.seller;
        const lender = POSITION.TX.loanOffering.payer;
        await callClosePositionDirectly(
          CONTRACTS.MARGIN,
          POSITION.TX,
          POSITION.NUM_TOKENS
        );
        await expectThrow( CONTRACTS.MARGIN.forceRecoverLoan(POSITION.ID, { from: lender }));
        const tx = await transact(POSITION.TOKEN_CONTRACT.withdraw, seller, { from: seller });

        expect(tx.result).to.be.bignumber.eq(0);
      }
    });

    it('fails when short is still open', async () => {
      // close short halfway and then try to withdraw
      await grantDirectCloseTokensToSeller();
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const seller = POSITION.TX.seller;
        await callClosePositionDirectly(
          CONTRACTS.MARGIN,
          POSITION.TX,
          POSITION.NUM_TOKENS.div(2)
        );
        await expectThrow( POSITION.TOKEN_CONTRACT.withdraw(seller, { from: seller }));
      }
    });

    it('withdraws no tokens after forceRecoverLoan', async () => {
      // close nothing, letting the lender forceRecoverLoan
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const seller = POSITION.TX.seller;
        const lender = POSITION.TX.loanOffering.payer;

        await CONTRACTS.MARGIN.forceRecoverLoan(POSITION.ID, { from: lender });

        const tx = await transact(POSITION.TOKEN_CONTRACT.withdraw, seller, { from: seller });
        expect(tx.result).to.be.bignumber.equal(0);
      }
    });
  });

  describe('#decimals', () => {
    it('returns decimal value of baseToken', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const [decimal, expectedDecimal] = await Promise.all([
          POSITION.TOKEN_CONTRACT.decimals.call(),
          baseToken.decimals.call()
        ]);
        expect(decimal).to.be.bignumber.equal(expectedDecimal);
      }
    });

    it('returns decimal value of baseToken, even if not initialized', async () => {
      await setUpShorts();
      const tokenContract = await ERC20Short.new(
        POSITIONS.FULL.ID,
        CONTRACTS.MARGIN.address,
        INITIAL_TOKEN_HOLDER,
        []);
      const [decimal, expectedDecimal] = await Promise.all([
        tokenContract.decimals.call(),
        baseToken.decimals.call()
      ]);
      expect(decimal).to.be.bignumber.equal(expectedDecimal);
    });
  });

  describe('#name', () => {
    it('successfully returns the marginId of the short', async () => {
      await setUpShorts();
      await setUpShortTokens();
      await transferShortsToTokens();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const [marginId, shortName] = await Promise.all([
          POSITION.TOKEN_CONTRACT.MARGIN_ID.call(),
          POSITION.TOKEN_CONTRACT.name.call()
        ]);
        expect(marginId).to.be.bignumber.equal(POSITION.ID);
        expect(shortName).to.equal("dYdX Tokenized Short " + POSITION.ID.toString());
      }
    });
  });
});
