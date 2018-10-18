const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());

const Margin = artifacts.require("Margin");
const ERC20Short = artifacts.require("ERC20Short");
const ERC20PositionWithdrawerV2 = artifacts.require("ERC20PositionWithdrawerV2");
const TestERC20Position = artifacts.require("TestERC20Position");
const OpenDirectlyExchangeWrapper = artifacts.require("OpenDirectlyExchangeWrapper");
const TestExchangeWrapper = artifacts.require("TestExchangeWrapper");
const HeldToken = artifacts.require("TokenA");
const OwedToken = artifacts.require("TokenB");
const WETH9 = artifacts.require("WETH9");
const { ADDRESSES, BYTES } = require('../../../../helpers/Constants');
const { doOpenPosition, callClosePositionDirectly } = require('../../../../helpers/MarginHelper');
const { transact } = require('../../../../helpers/ContractHelper');
const { wait } = require('@digix/tempo')(web3);
const { expectThrow } = require('../../../../helpers/ExpectHelper');
const BigNumber = require('bignumber.js');

contract('ERC20PositionWithdrawerV2', accounts => {
  let dydxMargin;
  let owedToken;
  let heldToken;
  let openDirectlyExchangeWrapper;
  let withdrawer;
  let weth;
  let testExchangeWrapper;
  let testErc20Position;

  let POSITION = {
    TOKEN_CONTRACT: null,
    TX: null,
    ID: null,
    SELL_ORDER: null,
    NUM_TOKENS: 0,
    PRINCIPAL: 0,
    SALT: 0
  };

  let pepper = 0;
  const INITIAL_TOKEN_HOLDER = accounts[9];
  const RANDO = accounts[8];

  before('Set up TokenProxy, Margin accounts', async () => {
    [
      dydxMargin,
      owedToken,
      heldToken,
      openDirectlyExchangeWrapper,
      withdrawer,
      weth,
      testExchangeWrapper,
      testErc20Position
    ] = await Promise.all([
      Margin.deployed(),
      OwedToken.deployed(),
      HeldToken.deployed(),
      OpenDirectlyExchangeWrapper.deployed(),
      ERC20PositionWithdrawerV2.deployed(),
      WETH9.deployed(),
      TestExchangeWrapper.new(),
      TestERC20Position.new(),
    ]);
  });

  async function setUpPositions() {
    pepper++;
    POSITION.SALT = 123456 + pepper;
    POSITION.TX = await doOpenPosition(accounts.slice(1), { salt: POSITION.SALT });
    POSITION.ID = POSITION.TX.id;
    POSITION.PRINCIPAL = POSITION.TX.principal;
    POSITION.NUM_TOKENS = await dydxMargin.getPositionPrincipal.call(POSITION.ID);
  }

  async function setUpTokens() {
    POSITION.TRUSTED_RECIPIENTS = [ADDRESSES.TEST[1], ADDRESSES.TEST[2]];
    POSITION.TRUSTED_WITHDRAWERS = [withdrawer.address];
    POSITION.TOKEN_CONTRACT = await ERC20Short.new(
      POSITION.ID,
      dydxMargin.address,
      INITIAL_TOKEN_HOLDER,
      POSITION.TRUSTED_RECIPIENTS,
      POSITION.TRUSTED_WITHDRAWERS,
    );
  }

  async function transferPositionsToTokens() {
    await dydxMargin.transferPosition(
      POSITION.ID,
      POSITION.TOKEN_CONTRACT.address,
      { from: POSITION.TX.trader }
    );
  }

  async function returnTokenstoTrader() {
    await POSITION.TOKEN_CONTRACT.transfer(
      POSITION.TX.trader,
      POSITION.NUM_TOKENS,
      { from: INITIAL_TOKEN_HOLDER }
    );
  }

  async function marginCallPositions(args) {
    args = args || {};
    args.cancel = args.cancel || false;
    const requiredDeposit = new BigNumber(10);

    if (args.cancel) {
      await dydxMargin.cancelMarginCall(
        POSITION.ID,
        { from : POSITION.TX.loanOffering.payer }
      );
    } else {
      await dydxMargin.marginCall(
        POSITION.ID,
        requiredDeposit,
        { from : POSITION.TX.loanOffering.payer }
      );
    }

    const fullCalled = await dydxMargin.isPositionCalled.call(POSITION.ID);
    expect(fullCalled).to.be.eq(!args.cancel);
  }

  describe('#withdraw', () => {
    beforeEach('Set up all tokenized positions, then margin-call, waiting for calltimelimit',
      async () => {
        await setUpPositions();
        await setUpTokens();
        await transferPositionsToTokens();
        await returnTokenstoTrader();
        await marginCallPositions();
        await wait(POSITION.TX.loanOffering.callTimeLimit);
      }
    );

    it('fails if caller has no tokens', async () => {
      // close half and force-recover
      const lender = POSITION.TX.loanOffering.payer;
      await callClosePositionDirectly(
        dydxMargin,
        POSITION.TX,
        POSITION.PRINCIPAL.div(2)
      );
      await dydxMargin.forceRecoverCollateral(POSITION.ID, lender, { from: lender });

      // rando can't withdraw
      const receipt = await transact(
        withdrawer.withdraw,
        POSITION.TOKEN_CONTRACT.address,
        owedToken.address,
        openDirectlyExchangeWrapper.address,
        BYTES.EMPTY,
        { from: RANDO }
      );
      expect(receipt.result[0]).to.be.bignumber.eq(0);
      expect(receipt.result[1]).to.be.bignumber.eq(0);
    });

    it('succeeds for non-weth', async () => {
      // set up closed position
      const heldTokenAmount = new BigNumber("1e18");
      const lender = POSITION.TX.loanOffering.payer;
      await heldToken.issueTo(POSITION.TOKEN_CONTRACT.address, heldTokenAmount);
      await dydxMargin.forceRecoverCollateral(POSITION.ID, lender, { from: lender });

      // set up exchange with tokens
      const tokenToReturn = new BigNumber("1e9");
      await owedToken.issueTo(testExchangeWrapper.address, tokenToReturn);
      await testExchangeWrapper.setValueToReturn(tokenToReturn);

      // check token values beforehand
      const owedTokenBalance0 = await owedToken.balanceOf.call(POSITION.TX.trader);

      // do the withdraw
      const receipt = await transact(
        withdrawer.withdraw,
        POSITION.TOKEN_CONTRACT.address,
        owedToken.address,
        testExchangeWrapper.address,
        BYTES.EMPTY,
        { from: POSITION.TX.trader }
      );

      // check token values afterwards
      const [
        owedTokenBalance1,
        marginTokenBalance1
      ] = await Promise.all([
        owedToken.balanceOf.call(POSITION.TX.trader),
        POSITION.TOKEN_CONTRACT.balanceOf.call(POSITION.TX.trader)
      ]);

      // verify the withdraw
      expect(marginTokenBalance1).to.be.bignumber.eq(0);
      expect(receipt.result[0]).to.be.bignumber.eq(heldTokenAmount);
      expect(receipt.result[1]).to.be.bignumber.eq(tokenToReturn);
      expect(owedTokenBalance1.minus(owedTokenBalance0)).to.be.bignumber.eq(tokenToReturn);
    });

    it('succeeds for weth', async () => {
      // set up closed position
      const heldTokenAmount = new BigNumber("1e18");
      const lender = POSITION.TX.loanOffering.payer;
      await heldToken.issueTo(POSITION.TOKEN_CONTRACT.address, heldTokenAmount);
      await dydxMargin.forceRecoverCollateral(POSITION.ID, lender, { from: lender });

      // set up exchange with weth
      const wethToReturn = new BigNumber("1e9");
      await weth.deposit({ value: wethToReturn });
      await weth.transfer(testExchangeWrapper.address, wethToReturn);
      await testExchangeWrapper.setValueToReturn(wethToReturn);

      // check token values beforehand
      const ethBalance0 = await web3.eth.getBalance(POSITION.TX.trader);

      // do the withdraw
      const receipt = await transact(
        withdrawer.withdraw,
        POSITION.TOKEN_CONTRACT.address,
        weth.address,
        testExchangeWrapper.address,
        BYTES.EMPTY,
        { from: POSITION.TX.trader }
      );

      // check token values afterwards
      const tx = await web3.eth.getTransaction(receipt.tx);
      const gasUsed = receipt.receipt.gasUsed;
      const gasPrice = tx.gasPrice;
      const gasFeeInWei = gasPrice.times(gasUsed);
      const [
        ethBalance1,
        marginTokenBalance1
      ] = await Promise.all([
        web3.eth.getBalance(POSITION.TX.trader),
        POSITION.TOKEN_CONTRACT.balanceOf.call(POSITION.TX.trader)
      ]);

      // verify the withdraw
      expect(marginTokenBalance1).to.be.bignumber.eq(0);
      expect(receipt.result[0]).to.be.bignumber.eq(heldTokenAmount);
      expect(receipt.result[1]).to.be.bignumber.eq(wethToReturn);
      expect(ethBalance1.minus(ethBalance0)).to.be.bignumber.eq(wethToReturn.minus(gasFeeInWei));
    });
  });

  describe('#withdrawToEth', () => {
    it('fails for non-WETH', async () => {
      // set up mock position
      const amount = new BigNumber("1e18");
      await Promise.all([
        testErc20Position.setter(owedToken.address, amount),
        owedToken.issueTo(testErc20Position.address, amount),
      ]);

      // do the withdraw
      await expectThrow(
        withdrawer.withdrawAsEth(
          testErc20Position.address,
          { from: POSITION.TX.trader }
        )
      );
    });

    it('returns zero for no tokens', async () => {
      // set up mock position
      await testErc20Position.setter(weth.address, 0)

      // do the withdraw
      const receipt = await transact(
        withdrawer.withdrawAsEth,
        testErc20Position.address,
        { from: RANDO },
      );

      expect(receipt.result).to.be.bignumber.eq(0);
    });

    it('succeeds', async () => {
      // set up mock position
      const amount = new BigNumber("1e18");
      await Promise.all([
        testErc20Position.setter(weth.address, amount),
        weth.deposit({ from: RANDO, value: amount }),
      ]);
      await weth.transfer(testErc20Position.address, amount, { from: RANDO });

      // get eth balance before
      const ethBalance0 = await web3.eth.getBalance(POSITION.TX.trader);

      // do the withdraw
      const receipt = await transact(
        withdrawer.withdrawAsEth,
        testErc20Position.address,
        { from: POSITION.TX.trader }
      );

      // check token values afterwards
      const tx = await web3.eth.getTransaction(receipt.tx);
      const gasUsed = receipt.receipt.gasUsed;
      const gasPrice = tx.gasPrice;
      const gasFeeInWei = gasPrice.times(gasUsed);
      const ethBalance1 = await web3.eth.getBalance(POSITION.TX.trader);

      // verify the withdraw
      expect(receipt.result).to.be.bignumber.eq(amount);
      expect(ethBalance1.minus(ethBalance0)).to.be.bignumber.eq(amount.minus(gasFeeInWei));
    });
  });
});
