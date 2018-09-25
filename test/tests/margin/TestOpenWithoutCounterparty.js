const chai = require('chai');
const expect = chai.expect;
const Web3 = require('web3');
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const Margin = artifacts.require("Margin");
const TokenProxy = artifacts.require("TokenProxy");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const Vault = artifacts.require("Vault");
const { ADDRESSES, BYTES32, BIGNUMBERS } = require('../../helpers/Constants');
const { issueAndSetAllowance } = require('../../helpers/TokenHelper');
const { expectLog } = require('../../helpers/EventHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');
const {
  getPosition,
  issueTokenToAccountInAmountAndApproveProxy
} = require('../../helpers/MarginHelper');

const web3Instance = new Web3(web3.currentProvider);

describe('#openWithoutCounterparty', () => {
  contract('Margin', accounts => {
    it('succeeds on valid inputs', async () => {
      const [
        openTx,
        dydxMargin
      ] = await Promise.all([
        setup(accounts),
        Margin.deployed()
      ]);

      const startingBalances = await getBalances(openTx);

      const tx = await callOpenWithoutCounterparty(dydxMargin, openTx);

      console.log(
        '\tMargin.openWithoutCounterparty gas used: '
        + tx.receipt.gasUsed
      );

      await validate(dydxMargin, openTx, tx, startingBalances);
    });
  });

  contract('Margin', accounts => {
    it('succeeds if different nonces are used', async () => {
      const [
        openTx,
        dydxMargin
      ] = await Promise.all([
        setup(accounts),
        Margin.deployed()
      ]);

      await callOpenWithoutCounterparty(dydxMargin, openTx);

      const openTx2 = await setup(accounts);
      openTx2.nonce = openTx2.nonce.plus(1);
      const startingBalances = await getBalances(openTx);
      const tx = await callOpenWithoutCounterparty(dydxMargin, openTx2);

      await validate(dydxMargin, openTx, tx, startingBalances);
    });
  });

  describe('Validations', () => {
    contract('Margin', accounts => {
      it('Fails if positionId already exists', async () => {
        const [
          openTx,
          dydxMargin
        ] = await Promise.all([
          setup(accounts),
          Margin.deployed()
        ]);

        await callOpenWithoutCounterparty(dydxMargin, openTx);

        // doesn't work for same nonce
        const openTx2 = await setup(accounts);
        await expectThrow(
          callOpenWithoutCounterparty(
            dydxMargin,
            openTx2,
            { shouldContain: true }
          )
        );

        // works with different nonce
        openTx2.nonce = openTx2.nonce.plus(1)
        await callOpenWithoutCounterparty(dydxMargin, openTx2);
      });
    });

    contract('Margin', accounts => {
      it('Fails if positionId already existed, but was closed', async () => {
        const [
          openTx,
          dydxMargin,
          owedToken
        ] = await Promise.all([
          setup(accounts),
          Margin.deployed(),
          OwedToken.deployed()
        ]);

        // open first position
        const tx = await callOpenWithoutCounterparty(dydxMargin, openTx);
        openTx.id = tx.id;

        // close position
        await issueTokenToAccountInAmountAndApproveProxy(
          owedToken,
          openTx.positionOwner,
          openTx.principal.times(2)
        );
        await dydxMargin.closePositionDirectly(
          openTx.id,
          openTx.principal,
          openTx.positionOwner,
          { from: openTx.positionOwner }
        );
        const closed = await dydxMargin.isPositionClosed.call(openTx.id);
        expect(closed).to.be.true;

        // doesn't work for same nonce
        const openTx2 = await setup(accounts);
        await expectThrow(
          callOpenWithoutCounterparty(
            dydxMargin,
            openTx2,
            { shouldContain: true }
          )
        );

        // works with different nonce
        openTx2.nonce = openTx2.nonce.plus(1)
        await callOpenWithoutCounterparty(dydxMargin, openTx2);
      });
    });

    contract('Margin', accounts => {
      it('Succeeds if callTimeLimit is 0', async () => {
        const [
          openTx,
          dydxMargin
        ] = await Promise.all([
          setup(accounts),
          Margin.deployed()
        ]);

        openTx.callTimeLimit = new BigNumber(0);

        const tx = await callOpenWithoutCounterparty(dydxMargin, openTx);
        const contains = await dydxMargin.containsPosition.call(tx.id);
        expect(contains).to.be.true;
      });
    });

    contract('Margin', accounts => {
      it('Fails if loan owner is 0', async () => {
        const [
          openTx,
          dydxMargin
        ] = await Promise.all([
          setup(accounts),
          Margin.deployed()
        ]);

        openTx.loanOwner = ADDRESSES.ZERO;

        await expectThrow(callOpenWithoutCounterparty(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('Fails if position owner is 0', async () => {
        const [
          openTx,
          dydxMargin
        ] = await Promise.all([
          setup(accounts),
          Margin.deployed()
        ]);

        openTx.positionOwner = ADDRESSES.ZERO;

        await expectThrow(callOpenWithoutCounterparty(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('Fails if principal is 0', async () => {
        const [
          openTx,
          dydxMargin
        ] = await Promise.all([
          setup(accounts),
          Margin.deployed()
        ]);

        openTx.principal = BIGNUMBERS.ZERO;

        await expectThrow(callOpenWithoutCounterparty(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('Fails if owedToken is 0', async () => {
        const [
          openTx,
          dydxMargin
        ] = await Promise.all([
          setup(accounts),
          Margin.deployed()
        ]);

        openTx.owedToken = ADDRESSES.ZERO;

        await expectThrow(callOpenWithoutCounterparty(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('Fails if owedToken is equal to heldToken', async () => {
        const [
          openTx,
          dydxMargin
        ] = await Promise.all([
          setup(accounts),
          Margin.deployed()
        ]);

        openTx.owedToken = openTx.heldToken;

        await expectThrow(callOpenWithoutCounterparty(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('Fails if maxDuration is 0', async () => {
        const [
          openTx,
          dydxMargin
        ] = await Promise.all([
          setup(accounts),
          Margin.deployed()
        ]);

        openTx.maxDuration = BIGNUMBERS.ZERO;

        await expectThrow(callOpenWithoutCounterparty(dydxMargin, openTx));
      });
    });

    contract('Margin', accounts => {
      it('Fails if interestPeriod is > maxDuration', async () => {
        const [
          openTx,
          dydxMargin
        ] = await Promise.all([
          setup(accounts),
          Margin.deployed()
        ]);

        openTx.interestPeriod = openTx.maxDuration.plus(1);

        await expectThrow(callOpenWithoutCounterparty(dydxMargin, openTx));
      });
    });
  });
});

async function setup(accounts) {
  const trader = accounts[1];
  const loanOwner = accounts[2];
  const positionOwner = accounts[3];

  const deposit   = new BigNumber('1098765932109876543');
  const principal = new BigNumber('2387492837498237491');
  const nonce = new BigNumber('19238');

  const callTimeLimit = BIGNUMBERS.ONE_DAY_IN_SECONDS;
  const maxDuration = BIGNUMBERS.ONE_YEAR_IN_SECONDS;

  const interestRate = new BigNumber('600000');
  const interestPeriod = BIGNUMBERS.ONE_DAY_IN_SECONDS;

  const heldToken = await HeldToken.deployed();

  await issueAndSetAllowance(
    heldToken,
    trader,
    deposit,
    TokenProxy.address
  );

  return {
    trader,
    loanOwner,
    positionOwner,
    deposit,
    principal,
    nonce,
    callTimeLimit,
    maxDuration,
    interestRate,
    interestPeriod,
    owedToken: OwedToken.address,
    heldToken: HeldToken.address
  };
}

async function callOpenWithoutCounterparty(
  dydxMargin,
  openTx,
  { shouldContain = false} = {}
) {
  const positionId = web3Instance.utils.soliditySha3(
    openTx.trader,
    openTx.nonce
  );

  let contains;

  if (!shouldContain) {
    contains = await dydxMargin.containsPosition.call(positionId);
    expect(contains).to.be.false;
  }

  const response = await dydxMargin.openWithoutCounterparty(
    [
      openTx.positionOwner,
      openTx.owedToken,
      openTx.heldToken,
      openTx.loanOwner
    ],
    [
      openTx.principal,
      openTx.deposit,
      openTx.nonce
    ],
    [
      openTx.callTimeLimit,
      openTx.maxDuration,
      openTx.interestRate,
      openTx.interestPeriod
    ],
    { from: openTx.trader }
  );

  contains = await dydxMargin.containsPosition.call(positionId);
  expect(contains).to.be.true;

  response.id = positionId;

  await expectOpenLog(dydxMargin, positionId, openTx, response);

  return response;
}

async function expectOpenLog(dydxMargin, positionId, openTx, response) {
  expectLog(response.logs[0], 'PositionOpened', {
    positionId: positionId,
    trader: openTx.trader,
    lender: openTx.trader,
    loanHash: BYTES32.ZERO,
    owedToken: openTx.owedToken,
    heldToken: openTx.heldToken,
    loanFeeRecipient: ADDRESSES.ZERO,
    principal: openTx.principal,
    heldTokenFromSell: BIGNUMBERS.ZERO,
    depositAmount: openTx.deposit,
    interestRate: openTx.interestRate,
    callTimeLimit: openTx.callTimeLimit,
    maxDuration: openTx.maxDuration,
    depositInHeldToken: true
  });

  const newOwner = await dydxMargin.getPositionOwner.call(positionId);
  const newLender = await dydxMargin.getPositionLender.call(positionId);
  let logIndex = 0;
  if (openTx.positionOwner !== openTx.trader) {
    expectLog(response.logs[++logIndex], 'PositionTransferred', {
      positionId: positionId,
      from: openTx.trader,
      to: openTx.positionOwner
    });
    if (newOwner !== openTx.positionOwner) {
      expectLog(response.logs[++logIndex], 'PositionTransferred', {
        positionId: positionId,
        from: openTx.positionOwner,
        to: newOwner
      });
    }
  }
  if (openTx.loanOwner !== openTx.trader) {
    expectLog(response.logs[++logIndex], 'LoanTransferred', {
      positionId: positionId,
      from: openTx.trader,
      to: openTx.loanOwner
    });
    if (newLender !== openTx.loanOwner) {
      expectLog(response.logs[++logIndex], 'LoanTransferred', {
        positionId: positionId,
        from: openTx.loanOwner,
        to: newLender
      });
    }
  }
}

async function validate(dydxMargin, openTx, tx, startingBalances) {
  const [
    position,
    positionBalance,
    { traderHeldToken, vaultHeldToken }
  ] = await Promise.all([
    getPosition(dydxMargin, tx.id),
    dydxMargin.getPositionBalance.call(tx.id),
    getBalances(openTx)
  ]);

  expect(position.owner).to.be.eq(openTx.positionOwner);
  expect(position.lender).to.be.eq(openTx.loanOwner);
  expect(position.owedToken).to.be.eq(OwedToken.address);
  expect(position.heldToken).to.be.eq(HeldToken.address);
  expect(position.principal).to.be.bignumber.eq(openTx.principal);
  expect(position.callTimeLimit).to.be.bignumber.eq(openTx.callTimeLimit);
  expect(position.maxDuration).to.be.bignumber.eq(openTx.maxDuration);
  expect(position.interestRate).to.be.bignumber.eq(openTx.interestRate);
  expect(position.interestPeriod).to.be.bignumber.eq(openTx.interestPeriod);
  expect(position.requiredDeposit).to.be.bignumber.eq(BIGNUMBERS.ZERO);
  expect(position.callTimestamp).to.be.bignumber.eq(BIGNUMBERS.ZERO);

  expect(positionBalance).to.be.bignumber.eq(openTx.deposit);
  expect(vaultHeldToken).to.be.bignumber.eq(startingBalances.vaultHeldToken.plus(openTx.deposit));
  expect(traderHeldToken).to.be.bignumber.eq(
    startingBalances.traderHeldToken.minus(openTx.deposit)
  );
}

async function getBalances(openTx) {
  const heldToken = await HeldToken.deployed();
  const [
    traderHeldToken,
    vaultHeldToken
  ] = await Promise.all([
    heldToken.balanceOf.call(openTx.trader),
    heldToken.balanceOf.call(Vault.address),
  ]);

  return { traderHeldToken, vaultHeldToken };
}
