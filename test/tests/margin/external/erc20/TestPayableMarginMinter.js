const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);

const Margin = artifacts.require("Margin");
const TokenProxy = artifacts.require("TokenProxy");
const WETH9 = artifacts.require("WETH9");
const HeldToken = artifacts.require("TokenA");
const ZeroExV1ExchangeWrapper = artifacts.require("ZeroExV1ExchangeWrapper");
const ERC20Short = artifacts.require("ERC20Short");
const ERC20ShortFactory = artifacts.require("ERC20ShortFactory");
const SharedLoan = artifacts.require("SharedLoan");
const SharedLoanFactory = artifacts.require("SharedLoanFactory");
const PayableMarginMinter = artifacts.require("PayableMarginMinter");
const { ZeroExProxyV1 } = require('../../../../contracts/ZeroExV1');

const { BIGNUMBERS, DEFAULT_SALT } = require('../../../../helpers/Constants');
const { createLoanOffering, signLoanOffering } = require('../../../../helpers/LoanHelper');
const { signOrder, createSignedV1BuyOrder } = require('../../../../helpers/ZeroExV1Helper');
const { issueAndSetAllowance } = require('../../../../helpers/TokenHelper');
const { transact } = require('../../../../helpers/ContractHelper');
const {
  issueTokenToAccountInAmountAndApproveProxy,
  orderToBytes
} = require('../../../../helpers/MarginHelper');


let Seo, Weth, Dai, dydxMargin;
let positionId, tokenContract, sharedLoanContract;
let salt = DEFAULT_SALT + 1;

contract('#PayableMarginMinter', accounts => {
  const opener = accounts[0];

  before('set up contracts', async () => {
    [dydxMargin, Weth, Dai] = await Promise.all([
      Margin.deployed(),
      WETH9.new(),
      HeldToken.new()
    ]);
    Seo = await PayableMarginMinter.new(Margin.address, Weth.address);
    await Weth.deposit({ value: new BigNumber("1e10"), from: opener });
    await Weth.approve(TokenProxy.address, BIGNUMBERS.MAX_UINT256, { from: opener });
    await issueTokenToAccountInAmountAndApproveProxy(Dai, opener, BIGNUMBERS.MAX_UINT128);
  });

  beforeEach('open position', async () => {
    const nonce = salt++;
    positionId = web3Instance.utils.soliditySha3(opener, nonce);
    await dydxMargin.openWithoutCounterparty(
      [
        ERC20ShortFactory.address,
        Weth.address,
        Dai.address,
        SharedLoanFactory.address
      ],
      [
        1000, // principal
        2000, // deposit
        nonce
      ],
      [
        2, // call timelimit
        1000, // max duration
        0, // interest rate
        1 // interest period
      ],
      { from: opener }
    );
    tokenContract = await dydxMargin.getPositionOwner.call(positionId);
    tokenContract = await ERC20Short.at(tokenContract);
    sharedLoanContract = await dydxMargin.getPositionLender.call(positionId);
    sharedLoanContract = await SharedLoan.at(sharedLoanContract);
  });

  it('succeeds on valid inputs', async () => {
    const trader = accounts[9];
    const principal = new BigNumber(10000);

    let order = await createSignedV1BuyOrder(accounts, { salt: salt++ });
    order.takerFee = order.makerFee = 0;
    order.makerTokenAddress = Dai.address,
    order.makerTokenAmount = new BigNumber("1e27");
    order.takerTokenAddress = Weth.address,
    order.takerTokenAmount = new BigNumber("1e27");
    order.ecSignature = await signOrder(order);
    await issueAndSetAllowance(
      Dai,
      order.maker,
      order.makerTokenAmount,
      ZeroExProxyV1.address
    );

    let loanOffering = await createLoanOffering(accounts, { salt: salt++ });
    loanOffering.owedToken = Weth.address;
    loanOffering.heldToken = Dai.address;
    loanOffering.owner = sharedLoanContract.address;
    loanOffering.rates.interestRate = 0;
    loanOffering.rates.minAmount = 0;
    loanOffering.rates.interestPeriod = 1;
    loanOffering.rates.lenderFee = new BigNumber(0);
    loanOffering.rates.takerFee = new BigNumber(0);
    loanOffering.rates.minHeldToken = new BigNumber(0);
    loanOffering.signature = await signLoanOffering(loanOffering);
    await Weth.deposit({ value: new BigNumber("1e10"), from: loanOffering.payer });
    await Weth.approve(TokenProxy.address, BIGNUMBERS.MAX_UINT256, { from: loanOffering.payer });

    const addresses = [
      loanOffering.payer,
      loanOffering.taker,
      loanOffering.positionOwner,
      loanOffering.feeRecipient,
      loanOffering.lenderFeeTokenAddress,
      loanOffering.takerFeeTokenAddress,
      ZeroExV1ExchangeWrapper.address
    ];

    const values256 = [
      loanOffering.rates.maxAmount,
      loanOffering.rates.minAmount,
      loanOffering.rates.minHeldToken,
      loanOffering.rates.lenderFee,
      loanOffering.rates.takerFee,
      loanOffering.expirationTimestamp,
      loanOffering.salt,
      principal
    ];

    const values32 = [
      loanOffering.callTimeLimit,
      loanOffering.maxDuration
    ];

    // extra ether
    const transaction1 = await transact(
      Seo.mintMarginTokens,
      positionId,
      addresses,
      values256,
      values32,
      false,
      loanOffering.signature,
      orderToBytes(order),
      {
        from: trader,
        value: principal.times(2)
      }
    );
    const actualTokens1 = await tokenContract.balanceOf.call(trader);
    expect(transaction1.result).to.be.bignumber.eq(principal);
    expect(transaction1.result).to.be.bignumber.eq(actualTokens1);

    // no extra ether
    const transaction2 = await transact(
      Seo.mintMarginTokens,
      positionId,
      addresses,
      values256,
      values32,
      false,
      loanOffering.signature,
      orderToBytes(order),
      {
        from: trader,
        value: principal
      }
    );
    const actualTokens2 = await tokenContract.balanceOf.call(trader);
    expect(transaction2.result).to.be.bignumber.eq(principal);
    expect(transaction2.result).to.be.bignumber.eq(actualTokens2.minus(actualTokens1));
  });
});
