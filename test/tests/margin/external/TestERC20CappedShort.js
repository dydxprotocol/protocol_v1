const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const Margin = artifacts.require("Margin");
const ERC20CappedShort = artifacts.require("ERC20CappedShort");
const ERC20CappedLong = artifacts.require("ERC20CappedLong");
const HeldToken = artifacts.require("TokenA");
const { ADDRESSES, BYTES32 } = require('../../../helpers/Constants');
const {
  callIncreasePosition,
  createOpenTx,
  doOpenPosition,
  issueTokensAndSetAllowances,
  issueTokenToAccountInAmountAndApproveProxy,
} = require('../../../helpers/MarginHelper');
const { expectThrow } = require('../../../helpers/ExpectHelper');
const { signLoanOffering } = require('../../../helpers/LoanHelper');
const BN = require('bignumber.js');

contract('ERC20Short', accounts => {
  let dydxMargin, heldToken;

  let POSITIONS = {
    LONG: {
      TOKEN_CONTRACT: null,
      TX: null,
      ID: null,
      SELL_ORDER: null,
      NUM_TOKENS: 0,
      PRINCIPAL: 0,
      SALT: 0
    },
    SHORT: {
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
      heldToken
    ] = await Promise.all([
      Margin.deployed(),
      HeldToken.deployed()
    ]);
  });

  async function setUpPositions() {
    pepper++;

    POSITIONS.LONG.SALT = 123456 + pepper;
    POSITIONS.SHORT.SALT = 654321 + pepper;

    POSITIONS.LONG.TX = await doOpenPosition(accounts.slice(1), { salt: POSITIONS.LONG.SALT });
    POSITIONS.SHORT.TX = await doOpenPosition(accounts.slice(2), { salt: POSITIONS.SHORT.SALT });

    expect(POSITIONS.LONG.TX.trader).to.be.not.eq(POSITIONS.SHORT.TX.trader);

    POSITIONS.LONG.ID = POSITIONS.LONG.TX.id;
    POSITIONS.SHORT.ID = POSITIONS.SHORT.TX.id;

    POSITIONS.LONG.PRINCIPAL = POSITIONS.LONG.TX.principal;
    POSITIONS.SHORT.PRINCIPAL = POSITIONS.SHORT.TX.principal;

    [
      POSITIONS.LONG.NUM_TOKENS,
      POSITIONS.SHORT.NUM_TOKENS
    ] = await Promise.all([
      dydxMargin.getPositionBalance.call(POSITIONS.LONG.ID),
      dydxMargin.getPositionPrincipal.call(POSITIONS.SHORT.ID)
    ]);
  }

  async function setUpTokens(multiplier) {
    POSITIONS.LONG.TRUSTED_RECIPIENTS = [ADDRESSES.TEST[1], ADDRESSES.TEST[2]];
    POSITIONS.SHORT.TRUSTED_RECIPIENTS = [ADDRESSES.TEST[3], ADDRESSES.TEST[4]];
    [
      POSITIONS.LONG.TOKEN_CONTRACT,
      POSITIONS.SHORT.TOKEN_CONTRACT
    ] = await Promise.all([
      ERC20CappedLong.new(
        POSITIONS.LONG.ID,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.LONG.TRUSTED_RECIPIENTS,
        POSITIONS.LONG.NUM_TOKENS.times(multiplier)
      ),
      ERC20CappedShort.new(
        POSITIONS.SHORT.ID,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.SHORT.TRUSTED_RECIPIENTS,
        POSITIONS.SHORT.NUM_TOKENS.times(multiplier)
      )
    ]);
  }

  async function transferPositionsToTokens() {
    await Promise.all([
      dydxMargin.transferPosition(
        POSITIONS.LONG.ID,
        POSITIONS.LONG.TOKEN_CONTRACT.address,
        { from: POSITIONS.LONG.TX.trader }
      ),
      dydxMargin.transferPosition(
        POSITIONS.SHORT.ID,
        POSITIONS.SHORT.TOKEN_CONTRACT.address,
        { from: POSITIONS.SHORT.TX.trader }
      ),
    ]);
  }

  describe('Constructor', () => {
    const positionId = BYTES32.TEST[0];
    const tokenCap = new BN('123456787654321');
    const trustedAccount = accounts[9];
    const untrustedAccount = accounts[8];

    it('sets constants correctly for short', async () => {
      const tokenContract = await ERC20CappedShort.new(
        positionId,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        [trustedAccount],
        tokenCap
      );
      const [
        supply,
        cap,
        pid,
        ith,
        trusted1,
        trusted2
      ] = await Promise.all([
        tokenContract.totalSupply.call(),
        tokenContract.tokenCap.call(),
        tokenContract.POSITION_ID.call(),
        tokenContract.INITIAL_TOKEN_HOLDER.call(),
        tokenContract.TRUSTED_RECIPIENTS.call(trustedAccount),
        tokenContract.TRUSTED_RECIPIENTS.call(untrustedAccount),
      ]);
      expect(supply).to.be.bignumber.eq(0);
      expect(cap).to.be.bignumber.eq(tokenCap);
      expect(pid).to.be.bignumber.eq(positionId);
      expect(ith).to.be.bignumber.eq(INITIAL_TOKEN_HOLDER);
      expect(trusted1).to.be.true;
      expect(trusted2).to.be.false;
    });

    it('sets constants correctly for long', async () => {
      const tokenContract = await ERC20CappedShort.new(
        positionId,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        [trustedAccount],
        tokenCap
      );
      const [
        supply,
        cap,
        pid,
        ith,
        trusted1,
        trusted2
      ] = await Promise.all([
        tokenContract.totalSupply.call(),
        tokenContract.tokenCap.call(),
        tokenContract.POSITION_ID.call(),
        tokenContract.INITIAL_TOKEN_HOLDER.call(),
        tokenContract.TRUSTED_RECIPIENTS.call(trustedAccount),
        tokenContract.TRUSTED_RECIPIENTS.call(untrustedAccount),
      ]);
      expect(supply).to.be.bignumber.eq(0);
      expect(cap).to.be.bignumber.eq(tokenCap);
      expect(pid).to.be.bignumber.eq(positionId);
      expect(ith).to.be.bignumber.eq(INITIAL_TOKEN_HOLDER);
      expect(trusted1).to.be.true;
      expect(trusted2).to.be.false;
    });
  });

  describe('#receivePositionOwnership', () => {
    it('succeeds for a high enough tokenCap', async () => {
      await setUpPositions();
      await setUpTokens(1);

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        await dydxMargin.transferPosition(
          POSITION.ID,
          POSITION.TOKEN_CONTRACT.address,
          { from: POSITION.TX.owner }
        );

        const supply = await POSITION.TOKEN_CONTRACT.totalSupply.call();

        expect(supply).to.be.bignumber.eq(POSITION.NUM_TOKENS);
      }
    });

    it('fails for low tokenCap', async () => {
      await setUpPositions();
      await setUpTokens(.9);

      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        await expectThrow(
          dydxMargin.transferPosition(
            POSITION.ID,
            POSITION.TOKEN_CONTRACT.address,
            { from: POSITION.TX.owner }
          )
        );
      }
    });
  });

  describe('#increasePositionOnBehalfOf', () => {
    let pepper = 0;

    async function doIncrease(position, acts, args) {
      args = args || {};
      args.throws = args.throws || false;
      args.multiplier = args.multiplier || 1;

      let incrTx = await createOpenTx(acts, { salt: 99999 + pepper });
      incrTx.loanOffering.rates.minHeldToken = new BN(0);
      incrTx.loanOffering.signature = await signLoanOffering(incrTx.loanOffering);
      incrTx.owner = position.TOKEN_CONTRACT.address;
      await issueTokensAndSetAllowances(incrTx);
      incrTx.id = position.TX.id;
      incrTx.principal = position.PRINCIPAL.times(args.multiplier);
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
        await setUpTokens(2);
        await transferPositionsToTokens();
      }
    );

    it('succeeds if the number of tokens remains under the token cap', async () => {
      let tempAccounts = accounts;
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        tempAccounts = tempAccounts.slice(1);
        await doIncrease(POSITION, tempAccounts, { throws: false, multiplier: 1 });

        const [
          supply,
          cap
        ] = await Promise.all([
          POSITION.TOKEN_CONTRACT.totalSupply.call(),
          POSITION.TOKEN_CONTRACT.tokenCap.call(),
        ]);
        expect(supply).to.be.bignumber.eq(cap);
      }
    });

    it('fails if it would exceed the token cap', async () => {
      let tempAccounts = accounts;
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        tempAccounts = tempAccounts.slice(1);
        await doIncrease(POSITION, tempAccounts, { throws: true, multiplier: 1.1 });
      }
    });
  });
});
