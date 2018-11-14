const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const ERC20CappedShort = artifacts.require("ERC20CappedShort");
const ERC20CappedLong = artifacts.require("ERC20CappedLong");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");

const { wait } = require('@digix/tempo')(web3);
const { ADDRESSES, BYTES32 } = require('../../../../helpers/Constants');
const {
  callIncreasePosition,
  createOpenTx,
  doOpenPosition,
  issueTokensAndSetAllowances,
  issueTokenToAccountInAmountAndApproveProxy,
} = require('../../../../helpers/MarginHelper');
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const { signLoanOffering } = require('../../../../helpers/LoanHelper');

contract('ERC20CappedPosition', accounts => {
  let dydxMargin, heldToken, owedToken;

  let POSITIONS = {
    LONG: {
      NAME: "LONG_NAME",
      SYMBOL: "LONG_SYMBOL",
      DECIMALS: 222,
      TOKEN_CONTRACT: null,
      TX: null,
      ID: null,
      SELL_ORDER: null,
      NUM_TOKENS: 0,
      PRINCIPAL: 0,
      SALT: 0
    },
    SHORT: {
      NAME: "SHORT_NAME",
      SYMBOL: "SHORT_SYMBOL",
      DECIMALS: 111,
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
  const TRUSTED_LATE_CLOSER = accounts[8];

  before('Set up Proxy, Margin accounts', async () => {
    [
      dydxMargin,
      heldToken,
      owedToken
    ] = await Promise.all([
      Margin.deployed(),
      HeldToken.deployed(),
      OwedToken.deployed()
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
    POSITIONS.LONG.TRUSTED_WITHDRAWERS = [ADDRESSES.TEST[3], ADDRESSES.TEST[4]];
    POSITIONS.SHORT.TRUSTED_RECIPIENTS = [ADDRESSES.TEST[3], ADDRESSES.TEST[4]];
    POSITIONS.SHORT.TRUSTED_WITHDRAWERS = [ADDRESSES.TEST[1], ADDRESSES.TEST[2]];
    [
      POSITIONS.LONG.TOKEN_CONTRACT,
      POSITIONS.SHORT.TOKEN_CONTRACT
    ] = await Promise.all([
      ERC20CappedLong.new(
        POSITIONS.LONG.ID,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.LONG.TRUSTED_RECIPIENTS,
        POSITIONS.LONG.TRUSTED_WITHDRAWERS,
        [TRUSTED_LATE_CLOSER],
        POSITIONS.LONG.NUM_TOKENS.times(multiplier),
        POSITIONS.LONG.NAME,
        POSITIONS.LONG.SYMBOL,
        POSITIONS.LONG.DECIMALS,
      ),
      ERC20CappedShort.new(
        POSITIONS.SHORT.ID,
        dydxMargin.address,
        INITIAL_TOKEN_HOLDER,
        POSITIONS.SHORT.TRUSTED_RECIPIENTS,
        POSITIONS.LONG.TRUSTED_WITHDRAWERS,
        [TRUSTED_LATE_CLOSER],
        POSITIONS.SHORT.NUM_TOKENS.times(multiplier),
        POSITIONS.SHORT.NAME,
        POSITIONS.SHORT.SYMBOL,
        POSITIONS.SHORT.DECIMALS,
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
    const tokenCap = new BigNumber('123456787654321');
    const trustedRecipient = accounts[9];
    const trustedWithdrawer = accounts[8];
    const trustedLateCloser = accounts[7];
    const initialTokenHolder = accounts[6];
    const untrustedAccount = accounts[5];
    const givenName = 'givenName';
    const givenSymbol = 'givenSymbol';
    const givenDecimals = 99;

    it('sets constants correctly for short', async () => {
      const tokenContract = await ERC20CappedShort.new(
        positionId,
        dydxMargin.address,
        initialTokenHolder,
        [trustedRecipient],
        [trustedWithdrawer],
        [trustedLateCloser],
        tokenCap,
        givenName,
        givenSymbol,
        givenDecimals,
      );
      const [
        supply,
        name,
        symbol,
        decimals,
        cap,
        pid,
        ith,
        tlc_is_tlc,
        tw_is_tlc,
        tr_is_tr,
        tw_is_tr,
        ua_is_tr,
        tr_is_tw,
        tw_is_tw,
        ua_is_tw,
      ] = await Promise.all([
        tokenContract.totalSupply.call(),
        tokenContract.name.call(),
        tokenContract.symbol.call(),
        tokenContract.decimals.call(),
        tokenContract.tokenCap.call(),
        tokenContract.POSITION_ID.call(),
        tokenContract.INITIAL_TOKEN_HOLDER.call(),
        tokenContract.TRUSTED_LATE_CLOSERS.call(trustedLateCloser),
        tokenContract.TRUSTED_LATE_CLOSERS.call(trustedWithdrawer),
        tokenContract.TRUSTED_RECIPIENTS.call(trustedRecipient),
        tokenContract.TRUSTED_RECIPIENTS.call(trustedWithdrawer),
        tokenContract.TRUSTED_RECIPIENTS.call(untrustedAccount),
        tokenContract.TRUSTED_WITHDRAWERS.call(trustedRecipient),
        tokenContract.TRUSTED_WITHDRAWERS.call(trustedWithdrawer),
        tokenContract.TRUSTED_WITHDRAWERS.call(untrustedAccount),
      ]);
      expect(supply).to.be.bignumber.eq(0);
      expect(name).to.be.eq(givenName);
      expect(symbol).to.be.eq(givenSymbol);
      expect(decimals).to.be.bignumber.eq(givenDecimals);
      expect(cap).to.be.bignumber.eq(tokenCap);
      expect(pid).to.be.bignumber.eq(positionId);
      expect(ith).to.be.bignumber.eq(initialTokenHolder);
      expect(tlc_is_tlc).to.be.true;
      expect(tw_is_tlc).to.be.false;
      expect(tr_is_tr).to.be.true;
      expect(tw_is_tr).to.be.false;
      expect(ua_is_tr).to.be.false;
      expect(tr_is_tw).to.be.false;
      expect(tw_is_tw).to.be.true;
      expect(ua_is_tw).to.be.false;
    });

    it('sets constants correctly for long', async () => {
      const tokenContract = await ERC20CappedLong.new(
        positionId,
        dydxMargin.address,
        initialTokenHolder,
        [trustedRecipient],
        [trustedWithdrawer],
        [trustedLateCloser],
        tokenCap,
        givenName,
        givenSymbol,
        givenDecimals,
      );
      const [
        supply,
        name,
        symbol,
        decimals,
        cap,
        pid,
        ith,
        tlc_is_tlc,
        tw_is_tlc,
        tr_is_tr,
        tw_is_tr,
        ua_is_tr,
        tr_is_tw,
        tw_is_tw,
        ua_is_tw,
      ] = await Promise.all([
        tokenContract.totalSupply.call(),
        tokenContract.name.call(),
        tokenContract.symbol.call(),
        tokenContract.decimals.call(),
        tokenContract.tokenCap.call(),
        tokenContract.POSITION_ID.call(),
        tokenContract.INITIAL_TOKEN_HOLDER.call(),
        tokenContract.TRUSTED_LATE_CLOSERS.call(trustedLateCloser),
        tokenContract.TRUSTED_LATE_CLOSERS.call(trustedWithdrawer),
        tokenContract.TRUSTED_RECIPIENTS.call(trustedRecipient),
        tokenContract.TRUSTED_RECIPIENTS.call(trustedWithdrawer),
        tokenContract.TRUSTED_RECIPIENTS.call(untrustedAccount),
        tokenContract.TRUSTED_WITHDRAWERS.call(trustedRecipient),
        tokenContract.TRUSTED_WITHDRAWERS.call(trustedWithdrawer),
        tokenContract.TRUSTED_WITHDRAWERS.call(untrustedAccount),
      ]);
      expect(supply).to.be.bignumber.eq(0);
      expect(name).to.be.eq(givenName);
      expect(symbol).to.be.eq(givenSymbol);
      expect(decimals).to.be.bignumber.eq(givenDecimals);
      expect(cap).to.be.bignumber.eq(tokenCap);
      expect(pid).to.be.bignumber.eq(positionId);
      expect(ith).to.be.bignumber.eq(initialTokenHolder);
      expect(tlc_is_tlc).to.be.true;
      expect(tw_is_tlc).to.be.false;
      expect(tr_is_tr).to.be.true;
      expect(tw_is_tr).to.be.false;
      expect(ua_is_tr).to.be.false;
      expect(tr_is_tw).to.be.false;
      expect(tw_is_tw).to.be.true;
      expect(ua_is_tw).to.be.false;
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

  describe('#setTrustedLateCloser', () => {
    it('fails for non-owner', async () => {
      const rando = accounts[6];
      for (let type in POSITIONS) {
        const contract = POSITIONS[type].TOKEN_CONTRACT;
        await expectThrow(
          contract.setTrustedLateCloser(rando, true, { from: rando })
        );
      }
    });

    it('succeeds for adding address', async () => {
      const rando = accounts[6];
      for (let type in POSITIONS) {
        const contract = POSITIONS[type].TOKEN_CONTRACT;
        const owner = await contract.owner.call();

        const before = await contract.TRUSTED_LATE_CLOSERS.call(rando);
        await contract.setTrustedLateCloser(rando, true, { from: owner });
        const after = await contract.TRUSTED_LATE_CLOSERS.call(rando);

        expect(before).to.be.false;
        expect(after).to.be.true;
      }
    });

    it('succeeds for removing address', async () => {
      for (let type in POSITIONS) {
        const contract = POSITIONS[type].TOKEN_CONTRACT;
        const owner = await contract.owner.call();

        const before = await contract.TRUSTED_LATE_CLOSERS.call(TRUSTED_LATE_CLOSER);
        await contract.setTrustedLateCloser(TRUSTED_LATE_CLOSER, false, { from: owner });
        const after = await contract.TRUSTED_LATE_CLOSERS.call(TRUSTED_LATE_CLOSER);

        expect(before).to.be.true;
        expect(after).to.be.false;
      }
    });
  });

  describe('#setTokenCap', () => {
    it('fails for non-owner', async () => {
      const rando = accounts[6];
      const newCap = new BigNumber(1000);
      await setUpTokens(0);
      for (let type in POSITIONS) {
        const contract = POSITIONS[type].TOKEN_CONTRACT;

        await expectThrow(
          contract.setTokenCap(newCap, { from: rando })
        );
      }
    });

    it('sets the value properly for uninitialized token contract', async () => {
      const newCap1 = new BigNumber(2000);
      const newCap2 = new BigNumber(1000);
      await setUpTokens(0);
      for (let type in POSITIONS) {
        const contract = POSITIONS[type].TOKEN_CONTRACT;

        const owner = await contract.owner.call();
        const contractCap1 = await contract.tokenCap.call();
        await contract.setTokenCap(newCap1, { from: owner });
        const contractCap2 = await contract.tokenCap.call();
        await contract.setTokenCap(newCap2, { from: owner });
        const contractCap3 = await contract.tokenCap.call();

        expect(contractCap1).to.be.bignumber.eq(0);
        expect(contractCap2).to.be.bignumber.eq(newCap1);
        expect(contractCap3).to.be.bignumber.eq(newCap2);
      }
    });

    it('sets values properly for initialized token contract', async () => {
      await setUpPositions();
      await setUpTokens(1);
      await transferPositionsToTokens();

      for (let type in POSITIONS) {
        const contract = POSITIONS[type].TOKEN_CONTRACT;

        const owner = await contract.owner.call();
        const contractCap1 = await contract.tokenCap.call();
        await contract.setTokenCap(contractCap1.div(2), { from: owner });
        const contractCap2 = await contract.tokenCap.call();
        await contract.setTokenCap(contractCap1.times(2), { from: owner });
        const contractCap3 = await contract.tokenCap.call();

        expect(contractCap2).to.be.bignumber.eq(contractCap1.div(2));
        expect(contractCap3).to.be.bignumber.eq(contractCap1.times(2));
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
      incrTx.loanOffering.rates.minHeldToken = new BigNumber(0);
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

    beforeEach('Set up all tokenized positions', async () => {
      await setUpPositions();
      await setUpTokens(2);
      await transferPositionsToTokens();
    });

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

    it('succeeds after increase', async () => {
      let tempAccounts = accounts;
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];
        tempAccounts = tempAccounts.slice(1);

        // increase fails
        await doIncrease(POSITION, tempAccounts, { throws: true, multiplier: 1.5 });

        // setTokenCap for higher amount
        const tokenContract = POSITION.TOKEN_CONTRACT;
        const owner = await tokenContract.owner.call();
        await tokenContract.setTokenCap(POSITION.NUM_TOKENS.times(4), { from: owner });

        // increase succeeds
        await doIncrease(POSITION, tempAccounts, { throws: false, multiplier: 1.5 });
      }
    });
  });

  describe('#closePositionOnBehalfOf', () => {
    const untrustedParty = accounts[0];

    beforeEach('set up positions', async () => {
      await setUpPositions();
      await setUpTokens(1);
      await transferPositionsToTokens();
    });

    it('succeeds even when remaining amount is above tokenCap', async () => {
      for (let type in POSITIONS) {
        const POSITION = POSITIONS[type];

        const tokenContract = POSITION.TOKEN_CONTRACT;
        const owner = await tokenContract.owner.call();
        await tokenContract.setTokenCap(POSITION.NUM_TOKENS.div(2), { from: owner });

        await doClose(POSITION, INITIAL_TOKEN_HOLDER, INITIAL_TOKEN_HOLDER, false);

        const [
          supply,
          cap
        ] = await Promise.all([
          POSITION.TOKEN_CONTRACT.totalSupply.call(),
          POSITION.TOKEN_CONTRACT.tokenCap.call(),
        ]);
        expect(supply).to.be.bignumber.gt(cap);
      }
    });

    it('fails for trusted closer without trusted recipient', async () => {
      for (let type in POSITIONS) {
        await doClose(POSITIONS[type], TRUSTED_LATE_CLOSER, untrustedParty, true);
      }

      await waitUntilEndOfPosition();

      for (let type in POSITIONS) {
        await doClose(POSITIONS[type], TRUSTED_LATE_CLOSER, untrustedParty, true);
      }
    });

    it('succeeds for trusted closer and trusted recipient', async () => {
      for (let type in POSITIONS) {
        const trustedRecipient = POSITIONS[type].TRUSTED_RECIPIENTS[0];
        await doClose(POSITIONS[type], TRUSTED_LATE_CLOSER, trustedRecipient, false);
      }

      await waitUntilEndOfPosition();

      for (let type in POSITIONS) {
        const trustedRecipient = POSITIONS[type].TRUSTED_RECIPIENTS[0];
        await doClose(POSITIONS[type], TRUSTED_LATE_CLOSER, trustedRecipient, false);
      }
    });

    it('succeeds only before expiration for trustedRecipient and non-trusted closer', async () => {
      for (let type in POSITIONS) {
        const trustedRecipient = POSITIONS[type].TRUSTED_RECIPIENTS[0];
        await doClose(POSITIONS[type], untrustedParty, trustedRecipient, false);
      }

      await waitUntilEndOfPosition();

      for (let type in POSITIONS) {
        const trustedRecipient = POSITIONS[type].TRUSTED_RECIPIENTS[0];
        await doClose(POSITIONS[type], untrustedParty, trustedRecipient, true);
      }
    });

    it('fails for untrusted closer and untrusted recipient', async () => {
      for (let type in POSITIONS) {
        await doClose(POSITIONS[type], untrustedParty, untrustedParty, true);
      }

      await waitUntilEndOfPosition();

      for (let type in POSITIONS) {
        await doClose(POSITIONS[type], untrustedParty, untrustedParty, true);
      }
    });

    async function waitUntilEndOfPosition() {
      const minWaitTime = 1 + Math.max(
        POSITIONS.LONG.TX.loanOffering.maxDuration,
        POSITIONS.SHORT.TX.loanOffering.maxDuration,
      );
      await wait(minWaitTime);
    }

    async function doClose(position, closer, recipient, throws) {
      await issueTokenToAccountInAmountAndApproveProxy(
        owedToken,
        closer,
        position.TX.loanOffering.rates.maxAmount
      );
      const promise = dydxMargin.closePositionDirectly(
        position.ID,
        position.NUM_TOKENS.div(10),
        recipient,
        { from: closer }
      );
      if (throws) {
        await expectThrow(promise);
      } else {
        await promise;
      }
    }
  });
});
