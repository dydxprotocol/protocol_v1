const chai = require('chai');
const expect = chai.expect;
const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const WETH = artifacts.require('TokenA');
const DAI = artifacts.require('TokenB');
const Margin = artifacts.require('Margin');
const TokenProxy = artifacts.require('TokenProxy');
const MakerOracle = artifacts.require('MakerOracle');
const MockMedianizer = artifacts.require('MockMedianizer');
const TestMarginCallDelegator = artifacts.require('TestMarginCallDelegator');

const { issueAndSetAllowance } = require('../../../../helpers/TokenHelper');

contract('MakerOracle', accounts => {

  // contracts
  let makerOracle;
  let medianizer;
  let margin;
  let weth;
  let dai;

  // collateral requirement as a percentage, parameter of MakerOracle contract
  const collateralRequirement = 150;

  // addresses
  const thirdPartyAddress = accounts[1];

  // ensures different poisition IDs each time
  let salt = 0;

  // stores the position IDs
  let positionIds = [0, 0];

  // runs once before everything else
  before('gets margin contract', async () => {
    margin = await Margin.deployed();
  });

  // runs before each 'describe' block
  beforeEach('sets up contracts and positions', async () => {
    // set up the relevant contracts
    [
      weth,
      dai,
      medianizer
    ] = await Promise.all([
      WETH.new(),
      DAI.new(),
      MockMedianizer.new()
    ]);
    makerOracle = await MakerOracle.new(
        margin.address, medianizer.address, collateralRequirement);

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
    // Suppose exchange rate of 200 DAI/ETH.
    // [0] Collateralize 400k DAI to take out 1k ETH => 200% collaterized.
    // [1] Collateralize 2k ETH to take out 200k DAI => 200% collaterized.
    const constants = {
      nonce: [new BigNumber(0).plus(salt), new BigNumber(999).plus(salt++)],
      principal: [new BigNumber('1e3'), new BigNumber('200e3')],
      deposit: [new BigNumber('400e3'), new BigNumber('2e3')],
      heldToken: [dai, weth],
      owedToken: [weth, dai],
      callTimeLimit: new BigNumber(100),
      maxDuration: new BigNumber(100),
      interestRate: new BigNumber(100),
      interestPeriod: new BigNumber(100),
    };

    // open the positions ([0] = shortEth position, [1] = longEth position)
    for (let i = 0; i < 2; i++) {
      // issue the tokens to the position opener
      await issueAndSetAllowance(
        constants.heldToken[i],
        defaultAccount,
        constants.deposit[i],
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
          constants.principal[i],
          constants.deposit[i],
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
  });

  describe('#marginCallOnBehalfOf (short position)', () => {
    it('succeeds if the position is undercollateralized', async () => {
      // Exchange rate of 267 DAI/ETH, just under collaterization requirement.
      await medianizer.poke(new BigNumber('267e18'));

      await margin.marginCall(positionIds[0], 0, { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(positionIds[0]);
      expect(isCalled).to.be.true;
    });

    it('fails if the position is not undercollateralized', async () => {
      // Exchange rate of 266 DAI/ETH, just over collaterization requirement.
      await medianizer.poke(new BigNumber('266e18'));

      await expectThrow(
        margin.marginCall(positionIds[0], 0, { from: thirdPartyAddress })
      );
      // TODO: May not work as expected--I'm not sure state resets between cases.
      const isCalled = await margin.isPositionCalled.call(positionIds[0]);
      expect(isCalled).to.be.false;
    });

    it('fails for non-zero deposit', async () => {
      await expectThrow(
        margin.marginCall(positionIds[0], 1, { from: thirdPartyAddress })
      );
    });
  });

  describe('#marginCallOnBehalfOf (long position)', () => {
    it('succeeds if the position is undercollateralized', async () => {
      // Exchange rate of 149 DAI/ETH, just under collaterization requirement.
      await medianizer.poke(new BigNumber('149e18'));

      await margin.marginCall(positionIds[1], 0, { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(positionIds[1]);
      expect(isCalled).to.be.true;
    });

    it('fails if the position is not undercollateralized', async () => {
      // Exchange rate of 150 DAI/ETH, exactly the collaterization requirement.
      await medianizer.poke(new BigNumber('150e18'));

      await expectThrow(
        margin.marginCall(positionIds[1], 0, { from: thirdPartyAddress })
      );
      // TODO: May not work as expected--I'm not sure state resets between cases.
      const isCalled = await margin.isPositionCalled.call(positionIds[1]);
      expect(isCalled).to.be.false;
    });

    it('fails for non-zero deposit', async () => {
      await expectThrow(
        margin.marginCall(positionIds[1], 1, { from: thirdPartyAddress })
      );
    });
  });

  describe('#cancelMarginCallOnBehalfOf (short position)', () => {
    beforeEach('margin-call the position', async () => {
      // Exchange rate of 267 DAI/ETH, just under collaterization requirement.
      await medianizer.poke(new BigNumber('267e18'));

      await margin.marginCall(positionIds[0], 0, { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(positionIds[0]);
      expect(isCalled).to.be.true;
      await wait(1);
    });

    it('fails if the position is undercollateralized', async () => {
      await expectThrow(
        margin.cancelMarginCall(positionIds[0], { from: thirdPartyAddress })
      );
    });

    it('succeeds if the position is not undercollateralized', async () => {
      // Exchange rate of 266 DAI/ETH, just over collaterization requirement.
      await medianizer.poke(new BigNumber('266e18'));

      await margin.cancelMarginCall(positionIds[0], { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(positionIds[0]);
      expect(isCalled).to.be.false;
    });
  });

  describe('#cancelMarginCallOnBehalfOf (long position)', () => {
    beforeEach('margin-call the position', async () => {
      // Exchange rate of 149 DAI/ETH, just under collaterization requirement.
      await medianizer.poke(new BigNumber('149e18'));

      await margin.marginCall(positionIds[1], 0, { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(positionIds[1]);
      expect(isCalled).to.be.true;
      await wait(1);
    });

    it('fails if the position is undercollateralized', async () => {
      await expectThrow(
        margin.cancelMarginCall(positionIds[1], { from: thirdPartyAddress })
      );
    });

    it('succeeds if the position is not undercollateralized', async () => {
      // Exchange rate of 150 DAI/ETH, exactly the collaterization requirement.
      await medianizer.poke(new BigNumber('150e18'));

      await margin.cancelMarginCall(positionIds[1], { from: thirdPartyAddress });
      const isCalled = await margin.isPositionCalled.call(positionIds[1]);
      expect(isCalled).to.be.false;
    });
  });
});
