/*global artifacts, web3, contract, describe, it, before, beforeEach*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const Margin = artifacts.require("Margin");
const ERC20Short = artifacts.require("ERC20Short");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const { ADDRESSES, BYTES32 } = require('../../helpers/Constants');
const {
  callClosePosition,
  callClosePositionDirectly,
  callIncreasePosition,
  createOpenTx,
  doOpenPosition,
  getPosition,
  issueTokensAndSetAllowances,
  issueTokensAndSetAllowancesForClose,
  issueTokenToAccountInAmountAndApproveProxy,
  getMaxInterestFee
} = require('../../helpers/MarginHelper');
const {
  createSignedSellOrder
} = require('../../helpers/ZeroExHelper');
const { transact } = require('../../helpers/ContractHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');
const { signLoanOffering } = require('../../helpers/LoanHelper');
const {
  getERC20PositionConstants,
  TOKENIZED_POSITION_STATE
} = require('./ERC20PositionHelper');
const { wait } = require('@digix/tempo')(web3);
const BigNumber = require('bignumber.js');

contract('ERC20Short', function(accounts) {
  let dydxMargin, owedToken, heldToken;

  let POSITIONS = {
    FULL: {
      TOKEN_CONTRACT: null,
      TX: null,
      ID: null,
      SELL_ORDER: null,
      NUM_TOKENS: 0,
      PRINCIPAL: 0,
      SALT: 0
    },
    PART: {
      TOKEN_CONTRACT: null,
      TX: null,
      ID: null,
      SELL_ORDER: null,
      NUM_TOKENS: 0,
      PRINCIPAL: 0,
      SALT: 0
    }
  };

  let pepper = 0;
  const INITIAL_TOKEN_HOLDER = accounts[9];

  before('Set up Proxy, Margin accounts', async () => {
    [
      dydxMargin,
      owedToken,
      heldToken
    ] = await Promise.all([
      Margin.deployed(),
      OwedToken.deployed(),
      HeldToken.deployed()
    ]);
  });

  async function setUpPositions() {
    pepper++;

    POSITIONS.FULL.SALT = 123456 + pepper;
    POSITIONS.PART.SALT = 654321 + pepper;

    POSITIONS.FULL.TX = await doOpenPosition(accounts.slice(1), { salt: POSITIONS.FULL.SALT });
    POSITIONS.PART.TX = await doOpenPosition(accounts.slice(2), { salt: POSITIONS.PART.SALT });

    expect(POSITIONS.FULL.TX.trader).to.be.not.equal(POSITIONS.PART.TX.trader);

    POSITIONS.FULL.ID = POSITIONS.FULL.TX.id;
    POSITIONS.PART.ID = POSITIONS.PART.TX.id;

    POSITIONS.PART.SELL_ORDER = await createSignedSellOrder(
      accounts,
      { salt: POSITIONS.PART.SALT }
    );
    await issueTokensAndSetAllowancesForClose(POSITIONS.PART.TX, POSITIONS.PART.SELL_ORDER);
    await callClosePosition(
      dydxMargin,
      POSITIONS.PART.TX,
      POSITIONS.PART.SELL_ORDER,
      POSITIONS.PART.TX.principal.div(2));

    POSITIONS.FULL.PRINCIPAL = POSITIONS.FULL.TX.principal;
    POSITIONS.PART.PRINCIPAL = POSITIONS.PART.TX.principal.div(2);

    [
      POSITIONS.FULL.NUM_TOKENS,
      POSITIONS.PART.NUM_TOKENS
    ] = await Promise.all([
      dydxMargin.getPositionPrincipal.call(POSITIONS.FULL.ID),
      dydxMargin.getPositionPrincipal.call(POSITIONS.PART.ID)
    ]);
  }

  async function setUpTokens() {
    POSITIONS.FULL.TRUSTED_RECIPIENTS = [ADDRESSES.TEST[1], ADDRESSES.TEST[2]];
    POSITIONS.PART.TRUSTED_RECIPIENTS = [ADDRESSES.TEST[3], ADDRESSES.TEST[4]];
    [
      POSITIONS.FULL.TOKEN_CONTRACT,
      POSITIONS.PART.TOKEN_CONTRACT
    ] = await Promise.all([
      ERC20Short.new(
        POSITIONS.FULL.ID,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.FULL.TRUSTED_RECIPIENTS),
      ERC20Short.new(
        POSITIONS.PART.ID,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.PART.TRUSTED_RECIPIENTS)
    ]);
  }

  async function transferPositionsToTokens() {
    await Promise.all([
      dydxMargin.transferPosition(
        POSITIONS.FULL.ID,
        POSITIONS.FULL.TOKEN_CONTRACT.address,
        { from: POSITIONS.FULL.TX.trader }
      ),
      dydxMargin.transferPosition(
        POSITIONS.PART.ID,
        POSITIONS.PART.TOKEN_CONTRACT.address,
        { from: POSITIONS.PART.TX.trader }
      ),
    ]);
  }

  async function returnTokenstoTrader() {
    await Promise.all([
      POSITIONS.FULL.TOKEN_CONTRACT.transfer(
        POSITIONS.FULL.TX.trader,
        POSITIONS.FULL.NUM_TOKENS,
        { from: INITIAL_TOKEN_HOLDER }
      ),
      POSITIONS.PART.TOKEN_CONTRACT.transfer(
        POSITIONS.PART.TX.trader,
        POSITIONS.PART.NUM_TOKENS,
        { from: INITIAL_TOKEN_HOLDER }
      )
    ]);
  }

  async function grantDirectCloseTokensToTrader(act = null) {
    const maxInterestFull = await getMaxInterestFee(POSITIONS.FULL.TX);
    const maxInterestPart = await getMaxInterestFee(POSITIONS.PART.TX);
    await issueTokenToAccountInAmountAndApproveProxy(
      owedToken,
      act ? act : POSITIONS.FULL.TX.trader,
      POSITIONS.FULL.PRINCIPAL.plus(maxInterestFull));
    await issueTokenToAccountInAmountAndApproveProxy(
      owedToken,
      act ? act : POSITIONS.PART.TX.trader,
      POSITIONS.PART.PRINCIPAL.plus(maxInterestPart));
  }

  async function marginCallPositions() {
    const requiredDeposit = new BigNumber(10);
    await Promise.all([
      dydxMargin.marginCall(
        POSITIONS.FULL.ID,
        requiredDeposit,
        { from : POSITIONS.FULL.TX.loanOffering.payer }
      ),
      dydxMargin.marginCall(
        POSITIONS.PART.ID,
        requiredDeposit,
        { from : POSITIONS.PART.TX.loanOffering.payer }
      ),
    ]);
  }

  describe('Constructor', () => {
    before('set up positions and tokens', async () => {
      await setUpPositions();
      await setUpTokens();
    });

    it('sets constants correctly', async () => {
      for (let type in POSITIONS) {
        const position = POSITIONS[type];
        const tsc = await getERC20PositionConstants(position.TOKEN_CONTRACT);
        expect(tsc.DYDX_MARGIN).to.equal(dydxMargin.address);
        expect(tsc.POSITION_ID).to.equal(position.ID);
        expect(tsc.state).to.be.bignumber.equal(TOKENIZED_POSITION_STATE.UNINITIALIZED);
        expect(tsc.INITIAL_TOKEN_HOLDER).to.equal(INITIAL_TOKEN_HOLDER);
        expect(tsc.heldToken).to.equal(ADDRESSES.ZERO);
        expect(tsc.symbol).to.equal("d/S");
        expect(tsc.name).to.equal("dYdX Short Token [UNINITIALIZED]");
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
    beforeEach('set up new positions and tokens', async () => {
      // Create new positions since state is modified by transferring them
      await setUpPositions();
      await setUpTokens();
    });

    it('succeeds for FULL and PART positions', async () => {
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        const tsc1 = await getERC20PositionConstants(POSITION.TOKEN_CONTRACT);

        await dydxMargin.transferPosition(POSITION.ID, POSITION.TOKEN_CONTRACT.address,
          { from: POSITION.TX.trader });

        const [tsc2, position] = await Promise.all([
          getERC20PositionConstants(POSITION.TOKEN_CONTRACT),
          getPosition(dydxMargin, POSITION.ID)
        ]);

        // expect certain values
        expect(tsc2.DYDX_MARGIN).to.equal(dydxMargin.address);
        expect(tsc2.POSITION_ID).to.equal(POSITION.ID);
        expect(tsc2.state).to.be.bignumber.equal(TOKENIZED_POSITION_STATE.OPEN);
        expect(tsc2.INITIAL_TOKEN_HOLDER).to.equal(INITIAL_TOKEN_HOLDER);
        expect(tsc2.heldToken).to.equal(position.heldToken);
        expect(tsc2.totalSupply).to.be.bignumber.equal(position.principal);

        // explicity make sure some things have changed
        expect(tsc2.state.equals(tsc1.state)).to.be.false;
        expect(tsc2.heldToken).to.not.equal(tsc1.heldToken);

        // explicity make sure some things have not changed
        expect(tsc2.POSITION_ID).to.equal(tsc1.POSITION_ID);
        expect(tsc2.DYDX_MARGIN).to.equal(tsc1.DYDX_MARGIN);
        expect(tsc2.INITIAL_TOKEN_HOLDER).to.equal(tsc1.INITIAL_TOKEN_HOLDER);
      }
    });

    it('fails for msg.sender != Margin', async () => {
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await expectThrow(
          POSITION.TOKEN_CONTRACT.receivePositionOwnership(
            INITIAL_TOKEN_HOLDER,
            POSITION.ID,
            { from: INITIAL_TOKEN_HOLDER }
          )
        );
      }
    });

    it('fails for a second position', async () => {
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const openTx = await doOpenPosition(accounts, { salt: 888 });
        await expectThrow(
          dydxMargin.transferPosition(
            openTx.id,
            POSITION.TOKEN_CONTRACT.address,
            { from: openTx.trader }
          )
        );
      }
    });
  });

  describe('#closeOnBehalfOf', () => {
    it('fails if not authorized', async () => {
      await setUpPositions();
      await setUpTokens();
      await transferPositionsToTokens();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const trader = POSITION.TX.trader;
        const amount = POSITION.PRINCIPAL;
        await expectThrow(
          POSITION.TOKEN_CONTRACT.closeOnBehalfOf(
            trader, trader, POSITION.ID, amount.div(2))
        );
      }
    });
  });

  describe('#closeOnBehalfOf via #closePositiondirectly', () => {
    beforeEach('set up positions and tokens', async () => {
      await setUpPositions();
      await setUpTokens();
    });

    it('fails if not transferred', async () => {
      // give owedTokens to token holder
      issueTokenToAccountInAmountAndApproveProxy(
        owedToken,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.FULL.PRINCIPAL + POSITIONS.PART.PRINCIPAL);

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await expectThrow(
          callClosePositionDirectly(
            dydxMargin,
            POSITION.TX,
            POSITION.PRINCIPAL,
            { from: INITIAL_TOKEN_HOLDER })
        );
      }
    });

    it('fails if user does not have the amount of owedToken required', async () => {
      await transferPositionsToTokens();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        await POSITION.TOKEN_CONTRACT.transfer(
          accounts[0],
          POSITION.NUM_TOKENS,
          { from: INITIAL_TOKEN_HOLDER }
        );

        await expectThrow(
          callClosePositionDirectly(
            dydxMargin,
            POSITION.TX,
            POSITION.PRINCIPAL,
            { from: POSITION.TX.trader }
          )
        );
      }
    });

    it('fails if value is zero', async () => {
      await transferPositionsToTokens();
      await returnTokenstoTrader();
      await grantDirectCloseTokensToTrader();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await expectThrow(
          callClosePositionDirectly(
            dydxMargin,
            POSITION.TX,
            0,
            { from: POSITION.TX.trader }
          )
        );
      }
    });

    it('closes up to the remainingAmount if user tries to close more', async () => {
      await transferPositionsToTokens();
      await returnTokenstoTrader();
      await grantDirectCloseTokensToTrader();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL.plus(1),
          { from: POSITION.TX.trader }
        );
      }
    });

    it('closes at most the number of tokens owned', async () => {
      await transferPositionsToTokens();
      await returnTokenstoTrader();
      await grantDirectCloseTokensToTrader();

      const rando = accounts[9];

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        // give away half of the tokens
        await POSITION.TOKEN_CONTRACT.transfer(
          rando,
          POSITION.NUM_TOKENS.div(2),
          { from: POSITION.TX.trader }
        );

        // try to close with too-large amount, but it will get bounded by the number of tokens owned
        const tx = await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL.times(10)
        );
        expect(tx.result[0] /* amountClosed */).to.be.bignumber.equal(POSITION.PRINCIPAL.div(2));
      }
    });

    it('fails if user does not own any of the tokenized position', async () => {
      await transferPositionsToTokens();
      await returnTokenstoTrader();
      await grantDirectCloseTokensToTrader(accounts[0]);

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await expectThrow(
          callClosePositionDirectly(
            dydxMargin,
            POSITION.TX,
            POSITION.PRINCIPAL,
            { from: accounts[0] }
          )
        );
      }
    });

    it('fails if closed', async () => {
      await transferPositionsToTokens();
      await returnTokenstoTrader();
      await grantDirectCloseTokensToTrader();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        // do it once to close it
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL,
          { from: POSITION.TX.trader }
        );

        // try again
        await expectThrow(
          callClosePositionDirectly(
            dydxMargin,
            POSITION.TX,
            POSITION.PRINCIPAL,
            { from: POSITION.TX.trader }
          )
        );
      }
    });

    it('succeeds for trusted recipient', async () => {
      await transferPositionsToTokens();
      await returnTokenstoTrader();
      await grantDirectCloseTokensToTrader();
      const rando = accounts[9];

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        // fails for random recipient
        await expectThrow(
          callClosePositionDirectly(
            dydxMargin,
            POSITION.TX,
            POSITION.PRINCIPAL,
            {
              from: rando,
              recipient: rando
            }
          )
        );

        // fails for not full amount
        await expectThrow(
          callClosePositionDirectly(
            dydxMargin,
            POSITION.TX,
            POSITION.PRINCIPAL.div(2),
            {
              from: rando,
              recipient: POSITION.TRUSTED_RECIPIENTS[1]
            }
          )
        );

        // succeeds for full amount and trusted recipient
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL,
          {
            from: rando,
            recipient: POSITION.TRUSTED_RECIPIENTS[1]
          }
        );
      }
    });

    it('succeeds otherwise', async () => {
      await transferPositionsToTokens();
      await returnTokenstoTrader();
      await grantDirectCloseTokensToTrader();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL
        );
      }
    });
  });

  describe('#marginPositionIncreased', () => {
    beforeEach('Set up all tokenized positions',
      async () => {
        await setUpPositions();
        await setUpTokens();
        await transferPositionsToTokens();
      }
    );

    it('succeeds', async () => {
      let pepper = 0;
      let tempAccounts = accounts;
      const divNumber = 2;

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        tempAccounts = tempAccounts.slice(1);
        let incrTx = await createOpenTx(tempAccounts, { salt: 99999 + pepper });
        incrTx.loanOffering.rates.minHeldToken = new BigNumber(0);
        incrTx.loanOffering.signature = await signLoanOffering(incrTx.loanOffering);
        incrTx.owner = POSITION.TOKEN_CONTRACT.address;
        await issueTokensAndSetAllowances(incrTx);
        incrTx.id = POSITION.TX.id;
        incrTx.principal = POSITION.PRINCIPAL.div(divNumber);
        await issueTokenToAccountInAmountAndApproveProxy(
          heldToken,
          incrTx.trader,
          incrTx.depositAmount.times(4)
        );
        await callIncreasePosition(dydxMargin, incrTx);

        const [traderBalance, ITHBalance, totalBalance] = await Promise.all([
          POSITION.TOKEN_CONTRACT.balanceOf.call(incrTx.trader),
          POSITION.TOKEN_CONTRACT.balanceOf.call(INITIAL_TOKEN_HOLDER),
          POSITION.TOKEN_CONTRACT.totalSupply.call()
        ]);

        expect(traderBalance).to.be.bignumber.equal(POSITION.NUM_TOKENS.div(divNumber));
        expect(ITHBalance).to.be.bignumber.equal(POSITION.NUM_TOKENS);
        expect(totalBalance).to.be.bignumber.equal(traderBalance.plus(ITHBalance));
      }
    });
  });

  describe('#withdrawMultiple', () => {
    beforeEach('Set up all tokenized positions, then margin-call, waiting for calltimelimit',
      async () => {
        await setUpPositions();
        await setUpTokens();
        await transferPositionsToTokens();
        await returnTokenstoTrader();
        await marginCallPositions();
        await wait(POSITIONS.FULL.TX.loanOffering.callTimeLimit);
      }
    );

    it('fails when position is still open', async () => {
      // close position halfway and then try to withdraw
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const trader = POSITION.TX.trader;
        await expectThrow(
          POSITION.TOKEN_CONTRACT.withdrawMultiple(
            [trader],
            { from: trader }
          )
        );
      }
    });

    it('succeeds for multiple accounts', async () => {
      // close half, force recover, then some random person can't withdraw any funds
      const heldTokenAmount = new BigNumber("1e18");
      const rando = accounts[9];
      const halfHolder = ADDRESSES.TEST[6];
      const noHolder = ADDRESSES.TEST[7];

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const lender = POSITION.TX.loanOffering.payer;
        const trader = POSITION.TX.trader;

        await heldToken.issueTo(POSITION.TOKEN_CONTRACT.address, heldTokenAmount);
        await dydxMargin.forceRecoverCollateral(POSITION.ID, lender, { from: lender });
        await POSITION.TOKEN_CONTRACT.transfer(
          halfHolder,
          POSITION.NUM_TOKENS.div(2),
          { from: trader }
        );

        const [traderBefore, halfHolderBefore, noHolderBefore] = await Promise.all([
          heldToken.balanceOf.call(trader),
          heldToken.balanceOf.call(halfHolder),
          heldToken.balanceOf.call(noHolder),
        ]);

        await POSITION.TOKEN_CONTRACT.withdrawMultiple(
          [trader, noHolder, trader, halfHolder],
          { from: rando }
        );

        const [traderAfter, halfHolderAfter, noHolderAfter] = await Promise.all([
          heldToken.balanceOf.call(trader),
          heldToken.balanceOf.call(halfHolder),
          heldToken.balanceOf.call(noHolder),
        ]);

        expect(
          traderAfter.minus(traderBefore)
        ).to.be.bignumber.equal(
          halfHolderAfter.minus(halfHolderBefore)
        ).to.be.bignumber.equal(
          heldTokenAmount.div(2)
        );
        expect(noHolderAfter.minus(noHolderBefore)).to.be.bignumber.equal(0);
      }
    });
  });

  describe('#withdraw', () => {
    beforeEach('Set up all tokenized positions, then margin-call, waiting for calltimelimit',
      async () => {
        await setUpPositions();
        await setUpTokens();
        await transferPositionsToTokens();
        await returnTokenstoTrader();
        await marginCallPositions();
        await wait(POSITIONS.FULL.TX.loanOffering.callTimeLimit);
      }
    );

    it('returns 0 when caller never had any tokens', async () => {
      // close half, force recover, then some random person can't withdraw any funds
      const rando = accounts[9];
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const lender = POSITION.TX.loanOffering.payer;
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL.div(2)
        );
        await dydxMargin.forceRecoverCollateral(POSITION.ID, lender, { from: lender });
        const tx = await transact(POSITION.TOKEN_CONTRACT.withdraw, rando, { from: rando });

        expect(tx.result).to.be.bignumber.eq(0);
      }
    });

    it('returns all HeldToken when user has all tokens', async () => {
      // close half, force recover, then some random person can't withdraw any funds
      const heldTokenAmount = new BigNumber("1e18");
      const rando = accounts[9];

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const lender = POSITION.TX.loanOffering.payer;

        await heldToken.issueTo(POSITION.TOKEN_CONTRACT.address, heldTokenAmount);
        await dydxMargin.forceRecoverCollateral(POSITION.ID, lender, { from: lender });
        const tx = await transact(
          POSITION.TOKEN_CONTRACT.withdraw,
          POSITION.TX.trader,
          { from: rando }
        );

        expect(tx.result).to.be.bignumber.eq(heldTokenAmount);
      }
    });

    it('returns 0 when position is completely closed', async () => {
      // close the position completely and then try to withdraw
      await grantDirectCloseTokensToTrader();
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const trader = POSITION.TX.trader;
        const lender = POSITION.TX.loanOffering.payer;
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL
        );
        await expectThrow(
          dydxMargin.forceRecoverCollateral(POSITION.ID, lender, { from: lender })
        );
        const tx = await transact(POSITION.TOKEN_CONTRACT.withdraw, trader, { from: trader });

        expect(tx.result).to.be.bignumber.eq(0);
      }
    });

    it('fails when position is still open', async () => {
      // close position halfway and then try to withdraw
      await grantDirectCloseTokensToTrader();
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const trader = POSITION.TX.trader;
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL.div(2)
        );
        await expectThrow(POSITION.TOKEN_CONTRACT.withdraw(trader, { from: trader }));
      }
    });

    it('withdraws no tokens after forceRecoverCollateral', async () => {
      // close nothing, letting the lender forceRecoverCollateral
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const trader = POSITION.TX.trader;
        const lender = POSITION.TX.loanOffering.payer;

        await dydxMargin.forceRecoverCollateral(POSITION.ID, lender, { from: lender });

        const tx = await transact(POSITION.TOKEN_CONTRACT.withdraw, trader, { from: trader });
        expect(tx.result).to.be.bignumber.equal(0);
      }
    });
  });

  describe('#getPositionDeedHolder', () => {
    it('successfully returns its own address for any valid position', async () => {
      await setUpPositions();
      await setUpTokens();
      await transferPositionsToTokens();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const dh = await POSITION.TOKEN_CONTRACT.getPositionDeedHolder.call(POSITION.ID);
        expect(dh).to.equal(POSITION.TOKEN_CONTRACT.address);

        // fail for bad id
        await expectThrow(
          POSITION.TOKEN_CONTRACT.getPositionDeedHolder.call(BYTES32.TEST[0])
        );
      }
    });
  });

  describe('#decimals', () => {
    it('returns decimal value of owedToken', async () => {
      await setUpPositions();
      await setUpTokens();
      await transferPositionsToTokens();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const [decimal, expectedDecimal] = await Promise.all([
          POSITION.TOKEN_CONTRACT.decimals.call(),
          owedToken.decimals.call()
        ]);
        expect(decimal).to.be.bignumber.equal(expectedDecimal);
      }
    });

    it('returns decimal value of owedToken, even if not initialized', async () => {
      await setUpPositions();
      const tokenContract = await ERC20Short.new(
        POSITIONS.FULL.ID,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        []);
      const [decimal, expectedDecimal] = await Promise.all([
        tokenContract.decimals.call(),
        owedToken.decimals.call()
      ]);
      expect(decimal).to.be.bignumber.equal(expectedDecimal);
    });
  });

  describe('#name', () => {
    it('successfully returns the positionId of the position', async () => {
      await setUpPositions();
      await setUpTokens();
      await transferPositionsToTokens();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const [positionId, tokenName] = await Promise.all([
          POSITION.TOKEN_CONTRACT.POSITION_ID.call(),
          POSITION.TOKEN_CONTRACT.name.call()
        ]);
        expect(positionId).to.be.bignumber.equal(POSITION.ID);
        expect(tokenName).to.equal("dYdX Short Token " + POSITION.ID.toString());
      }
    });
  });
});
