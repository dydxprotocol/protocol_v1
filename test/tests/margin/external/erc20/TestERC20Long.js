const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const Margin = artifacts.require("Margin");
const ERC20Long = artifacts.require("ERC20Long");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const { ADDRESSES, BYTES32 } = require('../../../../helpers/Constants');
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
} = require('../../../../helpers/MarginHelper');
const {
  createSignedV1SellOrder
} = require('../../../../helpers/ZeroExV1Helper');
const { transact } = require('../../../../helpers/ContractHelper');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const { signLoanOffering } = require('../../../../helpers/LoanHelper');
const {
  getERC20PositionConstants,
  TOKENIZED_POSITION_STATE
} = require('./ERC20PositionHelper');
const { wait } = require('@digix/tempo')(web3);
const BigNumber = require('bignumber.js');

contract('ERC20Long', accounts => {
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

  before('Set up TokenProxy, Margin accounts', async () => {
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

    expect(POSITIONS.FULL.TX.trader).to.be.not.eq(POSITIONS.PART.TX.trader);

    POSITIONS.FULL.ID = POSITIONS.FULL.TX.id;
    POSITIONS.PART.ID = POSITIONS.PART.TX.id;

    POSITIONS.PART.SELL_ORDER = await createSignedV1SellOrder(
      accounts,
      { salt: POSITIONS.PART.SALT }
    );
    await issueTokensAndSetAllowancesForClose(POSITIONS.PART.TX, POSITIONS.PART.SELL_ORDER);
    await callClosePosition(
      dydxMargin,
      POSITIONS.PART.TX,
      POSITIONS.PART.SELL_ORDER,
      POSITIONS.PART.TX.principal.div(2)
    );

    POSITIONS.FULL.PRINCIPAL = POSITIONS.FULL.TX.principal;
    POSITIONS.PART.PRINCIPAL = POSITIONS.PART.TX.principal.div(2).floor();

    [
      POSITIONS.FULL.NUM_TOKENS,
      POSITIONS.PART.NUM_TOKENS
    ] = await Promise.all([
      dydxMargin.getPositionBalance.call(POSITIONS.FULL.ID),
      dydxMargin.getPositionBalance.call(POSITIONS.PART.ID)
    ]);
  }

  async function setUpTokens() {
    POSITIONS.FULL.TRUSTED_RECIPIENTS = [ADDRESSES.TEST[1], ADDRESSES.TEST[2]];
    POSITIONS.PART.TRUSTED_RECIPIENTS = [ADDRESSES.TEST[3], ADDRESSES.TEST[4]];
    [
      POSITIONS.FULL.TOKEN_CONTRACT,
      POSITIONS.PART.TOKEN_CONTRACT
    ] = await Promise.all([
      ERC20Long.new(
        POSITIONS.FULL.ID,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.FULL.TRUSTED_RECIPIENTS,
        []
      ),
      ERC20Long.new(
        POSITIONS.PART.ID,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.PART.TRUSTED_RECIPIENTS,
        []
      )
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
      POSITIONS.FULL.TOKEN_CONTRACT.transfer(POSITIONS.FULL.TX.trader, POSITIONS.FULL.NUM_TOKENS,
        { from: INITIAL_TOKEN_HOLDER }),
      POSITIONS.PART.TOKEN_CONTRACT.transfer(POSITIONS.PART.TX.trader, POSITIONS.PART.NUM_TOKENS,
        { from: INITIAL_TOKEN_HOLDER })
    ]);
  }

  async function grantDirectCloseTokensToTrader(act = null) {
    const maxInterestFull = await getMaxInterestFee(POSITIONS.FULL.TX);
    const maxInterestPart = await getMaxInterestFee(POSITIONS.PART.TX);
    await issueTokenToAccountInAmountAndApproveProxy(
      owedToken,
      act ? act : POSITIONS.FULL.TX.trader,
      POSITIONS.FULL.PRINCIPAL.plus(maxInterestFull)
    );
    await issueTokenToAccountInAmountAndApproveProxy(
      owedToken,
      act ? act : POSITIONS.PART.TX.trader,
      POSITIONS.PART.PRINCIPAL.plus(maxInterestPart)
    );
  }

  async function marginCallPositions(args) {
    args = args || {};
    args.cancel = args.cancel || false;
    const requiredDeposit = new BigNumber(10);

    if (args.cancel) {
      await Promise.all([
        dydxMargin.cancelMarginCall(
          POSITIONS.FULL.ID,
          { from : POSITIONS.FULL.TX.loanOffering.payer }
        ),
        dydxMargin.cancelMarginCall(
          POSITIONS.PART.ID,
          { from : POSITIONS.PART.TX.loanOffering.payer }
        ),
      ]);
    } else {
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

    const [
      fullCalled,
      partCalled
    ] = await Promise.all([
      dydxMargin.isPositionCalled.call(POSITIONS.FULL.ID),
      dydxMargin.isPositionCalled.call(POSITIONS.PART.ID),
    ]);
    expect(fullCalled).to.be.eq(!args.cancel);
    expect(partCalled).to.be.eq(!args.cancel);
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
        expect(tsc.DYDX_MARGIN).to.eq(dydxMargin.address);
        expect(tsc.POSITION_ID).to.eq(position.ID);
        expect(tsc.state).to.be.bignumber.eq(TOKENIZED_POSITION_STATE.UNINITIALIZED);
        expect(tsc.INITIAL_TOKEN_HOLDER).to.eq(INITIAL_TOKEN_HOLDER);
        expect(tsc.heldToken).to.eq(ADDRESSES.ZERO);
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
          { from: POSITION.TX.owner });

        const [tsc2, position, positionBalance] = await Promise.all([
          getERC20PositionConstants(POSITION.TOKEN_CONTRACT),
          getPosition(dydxMargin, POSITION.ID),
          dydxMargin.getPositionBalance.call(POSITION.ID)
        ]);

        // expect certain values
        expect(tsc2.DYDX_MARGIN).to.eq(dydxMargin.address);
        expect(tsc2.POSITION_ID).to.eq(POSITION.ID);
        expect(tsc2.state).to.be.bignumber.eq(TOKENIZED_POSITION_STATE.OPEN);
        expect(tsc2.INITIAL_TOKEN_HOLDER).to.eq(INITIAL_TOKEN_HOLDER);
        expect(tsc2.heldToken).to.eq(position.heldToken);
        expect(tsc2.totalSupply).to.be.bignumber.eq(positionBalance);

        // explicity make sure some things have changed
        expect(tsc2.state.equals(tsc1.state)).to.be.false;
        expect(tsc2.heldToken).to.not.eq(tsc1.heldToken);

        // explicity make sure some things have not changed
        expect(tsc2.POSITION_ID).to.eq(tsc1.POSITION_ID);
        expect(tsc2.DYDX_MARGIN).to.eq(tsc1.DYDX_MARGIN);
        expect(tsc2.INITIAL_TOKEN_HOLDER).to.eq(tsc1.INITIAL_TOKEN_HOLDER);
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

        // transfer first position
        await dydxMargin.transferPosition(
          POSITION.ID,
          POSITION.TOKEN_CONTRACT.address,
          { from: POSITION.TX.owner }
        );

        // transfer second position
        const openTx = await doOpenPosition(accounts, { salt: 887 });
        await expectThrow(dydxMargin.transferPosition(
          openTx.id,
          POSITION.TOKEN_CONTRACT.address,
          { from: openTx.owner }
        ));
      }
    });

    it('fails for a position with the wrong id', async () => {
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const openTx = await doOpenPosition(accounts, { salt: 888 });
        await expectThrow(dydxMargin.transferPosition(
          openTx.id,
          POSITION.TOKEN_CONTRACT.address,
          { from: openTx.owner }
        ));
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

  describe('#closeOnBehalfOf via #closePositionDirectly', () => {
    beforeEach('set up positions and tokens', async () => {
      await setUpPositions();
      await setUpTokens();
    });

    it('fails if not transferred', async () => {
      // give owedTokens to token holder
      issueTokenToAccountInAmountAndApproveProxy(
        owedToken,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.FULL.PRINCIPAL + POSITIONS.PART.PRINCIPAL
      );

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

        const givenTokens = POSITION.NUM_TOKENS.div(2).floor();
        const remainingTokens = POSITION.NUM_TOKENS.minus(givenTokens);

        // give away half of the tokens
        await POSITION.TOKEN_CONTRACT.transfer(
          rando,
          givenTokens,
          { from: POSITION.TX.trader }
        );

        // try to close with too-large amount, but it will get bounded by the number of tokens owned
        const tx = await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL
        );

        // expect heldTokenPayout to equal the number of tokens remaining
        expect(tx.result[1]).to.be.bignumber.eq(remainingTokens);
      }
    });

    it('closes at most the remaining amount after closedUsingTrustedRecipient', async () => {
      await transferPositionsToTokens();
      await returnTokenstoTrader();
      await grantDirectCloseTokensToTrader();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        // close to trusted recipient
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL.div(2),
          { recipient: POSITION.TRUSTED_RECIPIENTS[1] }
        );

        // close rest of tokens
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL,
          { from: POSITION.TX.trader }
        );
      }
    });

    it('closes at most the users balance after closedUsingTrustedRecipient', async () => {
      await transferPositionsToTokens();
      await returnTokenstoTrader();
      await grantDirectCloseTokensToTrader();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        // close to trusted recipient
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL.div(2),
          { recipient: POSITION.TRUSTED_RECIPIENTS[1] }
        );

        // give away most tokens
        const balance = await POSITION.TOKEN_CONTRACT.balanceOf.call(POSITION.TX.trader);
        await POSITION.TOKEN_CONTRACT.transfer(
          ADDRESSES.ONE,
          balance.times(3).div(4).floor(),
          { from: POSITION.TX.trader }
        );

        // close rest of tokens
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL,
          { from: POSITION.TX.trader }
        );
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

    it('succeeds for trusted recipient (full-close)', async () => {
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

    it('succeeds for trusted recipient (partial-close)', async () => {
      await transferPositionsToTokens();
      await returnTokenstoTrader();
      await grantDirectCloseTokensToTrader();
      const rando = accounts[9];
      let closedByTrustedParty;

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

        closedByTrustedParty = await POSITION.TOKEN_CONTRACT.closedUsingTrustedRecipient.call();
        expect(closedByTrustedParty).to.be.false;

        // succeeds for partial amount
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL.div(2),
          {
            from: rando,
            recipient: POSITION.TRUSTED_RECIPIENTS[1]
          }
        );

        closedByTrustedParty = await POSITION.TOKEN_CONTRACT.closedUsingTrustedRecipient.call();
        expect(closedByTrustedParty).to.be.true;

        // succeeds for partial amount again
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL.div(2),
          {
            from: rando,
            recipient: POSITION.TRUSTED_RECIPIENTS[1]
          }
        );

        closedByTrustedParty = await POSITION.TOKEN_CONTRACT.closedUsingTrustedRecipient.call();
        expect(closedByTrustedParty).to.be.true;
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

  describe('#increasePositionOnBehalfOf', () => {
    const divNumber = 2;
    let pepper = 0;

    async function doIncrease(position, acts, args) {
      args = args || {};
      args.throws = args.throws || false;

      let incrTx = await createOpenTx(acts, { salt: 99999 + pepper });
      incrTx.loanOffering.rates.minHeldToken = new BigNumber(0);
      incrTx.loanOffering.signature = await signLoanOffering(incrTx.loanOffering);
      incrTx.owner = position.TOKEN_CONTRACT.address;
      await issueTokensAndSetAllowances(incrTx);
      incrTx.id = position.TX.id;
      incrTx.principal = position.PRINCIPAL.div(divNumber);
      await issueTokenToAccountInAmountAndApproveProxy(
        heldToken,
        incrTx.trader,
        incrTx.depositAmount.times(4)
      );

      if (args.throws) {
        await expectThrow(callIncreasePosition(dydxMargin, incrTx));
      } else {
        await callIncreasePosition(dydxMargin, incrTx);
      }
      return incrTx;
    }

    beforeEach('Set up all tokenized positions',
      async () => {
        await setUpPositions();
        await setUpTokens();
        await transferPositionsToTokens();
      }
    );

    it('succeeds', async () => {
      let tempAccounts = accounts;
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        tempAccounts = tempAccounts.slice(1);
        const incrTx = await doIncrease(POSITION, tempAccounts);

        const [traderBalance, ITHBalance, totalBalance] = await Promise.all([
          POSITION.TOKEN_CONTRACT.balanceOf.call(incrTx.trader),
          POSITION.TOKEN_CONTRACT.balanceOf.call(INITIAL_TOKEN_HOLDER),
          POSITION.TOKEN_CONTRACT.totalSupply.call()
        ]);

        expect(traderBalance).to.be.bignumber.eq(POSITION.NUM_TOKENS.div(divNumber).ceil());
        expect(ITHBalance).to.be.bignumber.eq(POSITION.NUM_TOKENS);
        expect(totalBalance).to.be.bignumber.eq(traderBalance.plus(ITHBalance));
      }
    });

    it('fails while the position is margin-called', async () => {
      let tempAccounts = accounts;
      await marginCallPositions();
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        tempAccounts = tempAccounts.slice(1);
        await doIncrease(POSITION, tempAccounts, { throws: true });
      }
    });

    it('fails after a trusted-recipient was used', async () => {
      await marginCallPositions();
      const rando = accounts[9];

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        await grantDirectCloseTokensToTrader(rando);
        await callClosePositionDirectly(
          dydxMargin,
          POSITION.TX,
          POSITION.PRINCIPAL.div(2),
          {
            from: rando,
            recipient: POSITION.TRUSTED_RECIPIENTS[1]
          }
        );
      }

      await marginCallPositions({ cancel: true });

      let tempAccounts = accounts;
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        tempAccounts = tempAccounts.slice(1);
        await doIncrease(POSITION, tempAccounts, { throws: true });
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
      await grantDirectCloseTokensToTrader();
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

    it('fails when a non-trusted withdrawer attempts to withdraw on another account', async () => {
      const heldTokenAmount = new BigNumber("1e18");
      const rando = accounts[9];
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const lender = POSITION.TX.loanOffering.payer;

        await heldToken.issueTo(POSITION.TOKEN_CONTRACT.address, heldTokenAmount);
        await dydxMargin.forceRecoverCollateral(POSITION.ID, lender, { from: lender });
        await expectThrow(
          POSITION.TOKEN_CONTRACT.withdraw(
            POSITION.TX.trader,
            { from: rando }
          )
        );
      }
    });

    it('returns all HeldToken when user has all tokens', async () => {
      // close half, force recover, then some random person can't withdraw any funds
      const heldTokenAmount = new BigNumber("1e18");

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const lender = POSITION.TX.loanOffering.payer;

        await heldToken.issueTo(POSITION.TOKEN_CONTRACT.address, heldTokenAmount);
        await dydxMargin.forceRecoverCollateral(POSITION.ID, lender, { from: lender });
        const tx = await transact(
          POSITION.TOKEN_CONTRACT.withdraw,
          POSITION.TX.trader,
          { from: POSITION.TX.trader }
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
        expect(dh).to.eq(POSITION.TOKEN_CONTRACT.address);

        // fail for bad id
        await expectThrow(
          POSITION.TOKEN_CONTRACT.getPositionDeedHolder.call(BYTES32.TEST[0])
        );
      }
    });
  });

  describe('#decimals', () => {
    it('returns decimal value of heldToken', async () => {
      await setUpPositions();
      await setUpTokens();
      await transferPositionsToTokens();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const [decimal, expectedDecimal] = await Promise.all([
          POSITION.TOKEN_CONTRACT.decimals.call(),
          heldToken.decimals.call()
        ]);
        expect(decimal).to.be.bignumber.eq(expectedDecimal);
      }
    });

    it('fails if not initialized', async () => {
      await setUpPositions();
      const tokenContract = await ERC20Long.new(
        POSITIONS.FULL.ID,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        [],
        []
      );
      await expectThrow(tokenContract.decimals.call());
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
        expect(positionId).to.be.bignumber.eq(POSITION.ID);
        expect(tokenName).to.eq("dYdX Leveraged Long Token " + POSITION.ID.toString());
      }
    });

    it('succeeds if UNINITIALIZED', async () => {
      await setUpTokens();
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const tokenName = await POSITION.TOKEN_CONTRACT.name.call();
        expect(tokenName).to.eq("dYdX Leveraged Long Token [UNINITIALIZED]");
      }
    });
  });

  describe('#symbol', () => {
    it('successfully returns the positionId of the position', async () => {
      await setUpPositions();
      await setUpTokens();
      await transferPositionsToTokens();

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const [positionId, tokenSymbol, heldTokenSymbol] = await Promise.all([
          POSITION.TOKEN_CONTRACT.POSITION_ID.call(),
          POSITION.TOKEN_CONTRACT.symbol.call(),
          heldToken.symbol.call()
        ]);
        expect(positionId).to.be.bignumber.eq(POSITION.ID);
        expect(tokenSymbol).to.eq("L" + heldTokenSymbol);
      }
    });

    it('succeeds if UNINITIALIZED', async () => {
      await setUpTokens();
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        const tokenName = await POSITION.TOKEN_CONTRACT.symbol.call();
        expect(tokenName).to.eq("L[UNINITIALIZED]");
      }
    });
  });
});
