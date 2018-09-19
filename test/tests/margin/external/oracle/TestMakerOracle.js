const chai = require('chai');
const expect = chai.expect;
const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const WETH = artifacts.require('TokenA');
const DAI = artifacts.require('TokenB');
const TokenC = artifacts.require('TokenC');
const Margin = artifacts.require('Margin');
const TokenProxy = artifacts.require('TokenProxy');
const MakerOracle = artifacts.require('MakerOracle');
const MockMedianizer = artifacts.require('MockMedianizer');
const TestMarginCallDelegator = artifacts.require('TestMarginCallDelegator');

const { expectThrow } = require('../../../../helpers/ExpectHelper');
const { issueAndSetAllowance } = require('../../../../helpers/TokenHelper');
const { wait } = require('@digix/tempo')(web3);

// contracts
let makerOracle;
let medianizer;
let margin;

// collateral requirement as a percentage, parameter of MakerOracle contract
const collateralRequirement = new BigNumber("150e6");

// ensures different poisition IDs each time
let salt = 0;

// stores the position IDs
let shortPositionId;
let longPositionId;
let shortTokenCPositionId;
let longTokenCPositionId;

async function setOraclePrice(daiPerEth) {
  // Multiply by 10**18 and round to match format of the Medianizer contract.
  const priceE18 = new BigNumber(`${daiPerEth}e18`).round();
  const asHex = priceE18.toString(16);

  // Left-pad the hex string with zeros in order to pass the value as bytes32.
  const asHex256 = `0x${'0'.repeat(64 - asHex.length)}${asHex}`;

  return medianizer.poke(asHex256);
}

contract('MakerOracle', accounts => {

  // addresses
  // TODO: Use an address like accounts[1].
  const thirdPartyAddress = accounts[0];

  before('gets margin contract', async () => {
    margin = await Margin.deployed();
  });

  beforeEach('sets up contracts and positions', async () => {

    // token contracts
    let weth;
    let dai;
    let tokenC;

    // set up the relevant contracts
    [
      weth,
      dai,
      tokenC,
      medianizer
    ] = await Promise.all([
      WETH.new(),
      DAI.new(),
      TokenC.new(),
      MockMedianizer.new()
    ]);
    makerOracle = await MakerOracle.new(
        margin.address, medianizer.address, weth.address,
        dai.address, collateralRequirement);

    // transfer positions to a mock lender that defers margin-calling logic to the MakerOracle
    const defaultAccount = accounts[0];
    const loanOwner = await TestMarginCallDelegator.new(
      margin.address,
      defaultAccount,
      defaultAccount
    );
    await loanOwner.setToReturn(makerOracle.address);

    // set constants for positions
    //
    // Suppose an exchange rate of 200 DAI/ETH.
    // [0] Collateralize 400k DAI to take out 1k ETH => 200% collaterized.
    // [1] Collateralize 2k ETH to take out 200k DAI => 200% collaterized.
    const constants = {
      nonce: [
        new BigNumber(0).plus(salt),
        new BigNumber(999).plus(salt++),
        new BigNumber(1999).plus(salt++),
        new BigNumber(2999).plus(salt++),
      ],
      principal: [new BigNumber('1e3'), new BigNumber('200e3')],
      deposit: [new BigNumber('400e3'), new BigNumber('2e3')],
      heldToken: [dai, weth, dai, tokenC],
      owedToken: [weth, dai, tokenC, dai],
      callTimeLimit: new BigNumber(100),
      maxDuration: new BigNumber(100),
      interestRate: new BigNumber(100),
      interestPeriod: new BigNumber(100),
    };

    // Open the positions.
    // [0] = short ETH
    // [1] = long ETH
    // [2] = short TokenC
    // [3] = long TokenC
    let positionIds = [null, null, null, null];
    for (let i = 0; i < 4; i++) {
      // issue the tokens to the position opener
      await issueAndSetAllowance(
        constants.heldToken[i],
        defaultAccount,
        constants.deposit[i % 2],
        TokenProxy.address
      );

      // open the position
      await margin.openWithoutCounterparty(
        [
          defaultAccount, // positionOwner,
          constants.owedToken[i].address,
          constants.heldToken[i].address,
          loanOwner.address // loanOwner
        ],
        [
          constants.principal[i % 2],
          constants.deposit[i % 2],
          constants.nonce[i]
        ],
        [
          constants.callTimeLimit,
          constants.maxDuration,
          constants.interestRate,
          constants.interestPeriod
        ],
        { from: defaultAccount }
      );

      // extract the expected positionId
      positionIds[i] = web3Instance.utils.soliditySha3(defaultAccount, constants.nonce[i]);
    }

    [
      shortPositionId, longPositionId,
      shortTokenCPositionId, longTokenCPositionId
    ] = positionIds;
  });

  describe('#marginCallOnBehalfOf (short position)', () => {
    it('succeeds if the position is undercollateralized', async () => {
      // Exchange rate of 267 DAI/ETH, just under collaterization requirement.
      await setOraclePrice(267);

      await margin.marginCall(shortPositionId, 0, { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(shortPositionId);
      expect(isCalled).to.be.true;
    });

    it('fails if the position meets the collateral requirement', async () => {
      // Exchange rate of 266 DAI/ETH, just over collaterization requirement.
      await setOraclePrice(266);

      await expectThrow(
        margin.marginCall(shortPositionId, 0, { from: thirdPartyAddress })
      );
      const isCalled = await margin.isPositionCalled.call(shortPositionId);
      expect(isCalled).to.be.false;
    });

    it('fails for non-zero deposit', async () => {
      await expectThrow(
        margin.marginCall(shortPositionId, 1, { from: thirdPartyAddress })
      );
    });

    it('fails for an unsupported token', async () => {
      await setOraclePrice(267);
      await expectThrow(
        margin.marginCall(shortTokenCPositionId, 0, { from: thirdPartyAddress })
      );
    });
  });

  describe('#marginCallOnBehalfOf (long position)', () => {
    it('succeeds if the position is undercollateralized', async () => {
      // Exchange rate of 149 DAI/ETH, just under collaterization requirement.
      await setOraclePrice(149);

      await margin.marginCall(longPositionId, 0, { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(longPositionId);
      expect(isCalled).to.be.true;
    });

    it('fails if the position meets the collateral requirement', async () => {
      // Exchange rate of 151 DAI/ETH, just over the collaterization requirement.
      await setOraclePrice(151);

      await expectThrow(
        margin.marginCall(longPositionId, 0, { from: thirdPartyAddress })
      );
      const isCalled = await margin.isPositionCalled.call(longPositionId);
      expect(isCalled).to.be.false;
    });

    it('fails for non-zero deposit', async () => {
      await expectThrow(
        margin.marginCall(longPositionId, 1, { from: thirdPartyAddress })
      );
    });

    it('fails for an unsupported token', async () => {
      await setOraclePrice(149);
      await expectThrow(
        margin.marginCall(longTokenCPositionId, 0, { from: thirdPartyAddress })
      );
    });
  });

  describe('#cancelMarginCallOnBehalfOf (short position)', () => {
    beforeEach('margin-call the position', async () => {
      // Exchange rate of 267 DAI/ETH, just under collaterization requirement.
      await setOraclePrice(267);

      await margin.marginCall(shortPositionId, 0, { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(shortPositionId);
      expect(isCalled).to.be.true;
      await wait(1);
    });

    it('fails if the position is undercollateralized', async () => {
      await expectThrow(
        margin.cancelMarginCall(shortPositionId, { from: thirdPartyAddress })
      );
    });

    it('succeeds if the position meets the collateral requirement', async () => {
      // Exchange rate of 266 DAI/ETH, just over collaterization requirement.
      await setOraclePrice(266);

      await margin.cancelMarginCall(shortPositionId, { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(shortPositionId);
      expect(isCalled).to.be.false;
    });

    it('fails for an unsupported token', async () => {
      await setOraclePrice(267);
      await expectThrow(
        margin.cancelMarginCall(shortTokenCPositionId, { from: thirdPartyAddress })
      );
    });
  });

  describe('#cancelMarginCallOnBehalfOf (long position)', () => {
    beforeEach('margin-call the position', async () => {
      // Exchange rate of 149 DAI/ETH, just under collaterization requirement.
      await setOraclePrice(149);

      await margin.marginCall(longPositionId, 0, { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(longPositionId);
      expect(isCalled).to.be.true;
      await wait(1);
    });

    it('fails if the position is undercollateralized', async () => {
      await expectThrow(
        margin.cancelMarginCall(longPositionId, { from: thirdPartyAddress })
      );
    });

    it('succeeds if the position meets the collateral requirement', async () => {
      // Exchange rate of 151 DAI/ETH, just over the collaterization requirement.
      await setOraclePrice(151);

      await margin.cancelMarginCall(longPositionId, { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(longPositionId);
      expect(isCalled).to.be.false;
    });

    it('fails for an unsupported token', async () => {
      await setOraclePrice(149);
      await expectThrow(
        margin.cancelMarginCall(longTokenCPositionId, { from: thirdPartyAddress })
      );
    });
  });
});
