const chai = require('chai');
const expect = chai.expect;
const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');

const WETH = artifacts.require("TokenA");
const DAI = artifacts.require("TokenB");
const Margin = artifacts.require("Margin");
const TokenProxy = artifacts.require("TokenProxy");
const MakerOracle = artifacts.require("MakerOracle");
const MockMedianizer = artifacts.require("MockMedianizer");
const TestMarginCallDelegator = artifacts.require("TestMarginCallDelegator");

const { issueAndSetAllowance } = require('../../../../helpers/TokenHelper');

contract('this is the title of a section that redeploys all contracts', accounts => {

  // contracts
  let makerOracle;
  let medianizer;
  let margin;
  let weth;
  let dai;

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
    makerOracle = await MakerOracle.new(margin.address, medianizer.address);

    // transfer positions to a mock lender that defers margin-calling logic to the MakerOracle
    const defaultAccount = accounts[0];
    const loanOwner = await TestMarginCallDelegator.new(
      margin.address,
      defaultAccount,
      defaultAccount
    );
    await loanOwner.setToReturn(makerOracle.address);

    // set constants for positions
    const constants = {
      nonce: [new BigNumber(0).plus(salt), new BigNumber(999).plus(salt++)],
      principal: [new BigNumber("1e3"), new BigNumber("200e3")],
      deposit: [new BigNumber("400e3"), new BigNumber("2e3")],
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

  describe('TODO: this is the title of a single section', () => {
    it('TODO: this is the title of a single test', async () => {
      // TODO
    });
    // TODO
  });
});
