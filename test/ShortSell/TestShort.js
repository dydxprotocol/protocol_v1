/*global artifacts, web3, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const Web3 = require('web3');
const BigNumber = require('bignumber.js');

const ShortSell = artifacts.require("ShortSell");
const BaseToken = artifacts.require("TokenA");
const UnderlyingToken = artifacts.require("TokenB");
const FeeToken = artifacts.require("TokenC");
const Vault = artifacts.require("Vault");
const ZeroExProxy = artifacts.require("ZeroExProxy");
const ProxyContract = artifacts.require("Proxy");
const SmartContractLender = artifacts.require("SmartContractLender");
const { zeroExFeeTokenConstant } = require('../helpers/Constants');

const web3Instance = new Web3(web3.currentProvider);

const {
  createShortSellTx,
  issueTokensAndSetAllowancesForShort,
  callShort,
  getPartialAmount,
  sign0xOrder,
  getShort,
  signLoanOffering
} = require('../helpers/ShortSellHelper');

describe('#short', () => {
  contract('ShortSell', function(accounts) {
    it('succeeds on valid inputs', async () => {
      const shortTx = await createShortSellTx(accounts);
      const shortSell = await ShortSell.deployed();

      await issueTokensAndSetAllowancesForShort(shortTx);

      const tx = await callShort(shortSell, shortTx);

      console.log('\tShortSell.short (dYdX Exchange Contract) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('ShortSell', function(accounts) {
    it('succeeds when using 0x exchange contract', async () => {
      const shortTx = await createShortSellTx(accounts);
      const [shortSell, feeToken, baseToken] = await Promise.all([
        ShortSell.deployed(),
        FeeToken.deployed(),
        BaseToken.deployed(),
      ]);

      await issueTokensAndSetAllowancesForShort(shortTx);
      shortTx.buyOrder.makerFeeTokenAddress = zeroExFeeTokenConstant;
      shortTx.buyOrder.ecSignature = await sign0xOrder(shortTx.buyOrder);

      // Set allowances on the 0x proxy, not the dYdX proxy
      await Promise.all([
        feeToken.approve(
          ProxyContract.address,
          new BigNumber(0),
          { from: shortTx.buyOrder.maker }
        ),
        feeToken.approve(
          ZeroExProxy.address,
          shortTx.buyOrder.makerFee,
          { from: shortTx.buyOrder.maker }
        ),
        baseToken.approve(
          ProxyContract.address,
          new BigNumber(0),
          { from: shortTx.buyOrder.maker }
        ),
        baseToken.approve(
          ZeroExProxy.address,
          shortTx.buyOrder.makerTokenAmount,
          { from: shortTx.buyOrder.maker }
        ),
      ]);

      const tx = await callShort(shortSell, shortTx);

      console.log('\tShortSell.short (0x Exchange Contract) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(shortSell, shortTx);
    });
  });

  contract('ShortSell', function(accounts) {
    it('allows smart contracts to be lenders', async () => {
      const shortTx = await createShortSellTx(accounts);
      const [
        shortSell,
        feeToken,
        underlyingToken,
        smartContractLender
      ] = await Promise.all([
        ShortSell.deployed(),
        FeeToken.deployed(),
        UnderlyingToken.deployed(),
        SmartContractLender.new(true)
      ]);

      await issueTokensAndSetAllowancesForShort(shortTx);

      const [
        lenderFeeTokenBalance,
        lenderUnderlyingTokenBalance
      ] = await Promise.all([
        feeToken.balanceOf.call(shortTx.loanOffering.lender),
        underlyingToken.balanceOf.call(shortTx.loanOffering.lender)
      ]);
      await Promise.all([
        feeToken.transfer(
          smartContractLender.address,
          lenderFeeTokenBalance,
          { from: shortTx.loanOffering.lender }
        ),
        underlyingToken.transfer(
          smartContractLender.address,
          lenderUnderlyingTokenBalance,
          { from: shortTx.loanOffering.lender }
        )
      ]);
      await Promise.all([
        smartContractLender.allow(
          feeToken.address,
          ProxyContract.address,
          lenderFeeTokenBalance
        ),
        smartContractLender.allow(
          underlyingToken.address,
          ProxyContract.address,
          lenderUnderlyingTokenBalance
        )
      ]);

      shortTx.loanOffering.signer = shortTx.loanOffering.lender;
      shortTx.loanOffering.lender = smartContractLender.address;
      shortTx.loanOffering.signature = await signLoanOffering(shortTx.loanOffering);

      const tx = await callShort(shortSell, shortTx);

      console.log('\tShortSell.short (smart contract lender) gas used: ' + tx.receipt.gasUsed);

      await checkSuccess(shortSell, shortTx);
    });
  });
});

async function checkSuccess(shortSell, shortTx) {
  const shortId = web3Instance.utils.soliditySha3(
    shortTx.loanOffering.loanHash,
    0
  );

  const contains = await shortSell.containsShort.call(shortId);
  expect(contains).to.equal(true);
  const short = await getShort(shortSell, shortId);
  const proratedInterestRate =
    shortTx.loanOffering.rates.dailyInterestFee
      .mul(short.shortAmount)
      .dividedToIntegerBy(shortTx.loanOffering.rates.maxAmount); // rounds down

  expect(short.underlyingToken).to.equal(shortTx.underlyingToken);
  expect(short.baseToken).to.equal(shortTx.baseToken);
  expect(short.shortAmount).to.be.bignumber.equal(shortTx.shortAmount);
  expect(short.interestRate).to.be.bignumber.equal(proratedInterestRate);
  expect(short.callTimeLimit).to.be.bignumber.equal(shortTx.loanOffering.callTimeLimit);
  expect(short.lockoutTime).to.be.bignumber.equal(shortTx.loanOffering.lockoutTime);
  expect(short.lender).to.equal(shortTx.loanOffering.lender);
  expect(short.seller).to.equal(shortTx.seller);
  expect(short.closedAmount).to.be.bignumber.equal(0);
  expect(short.callTimestamp).to.be.bignumber.equal(0);
  expect(short.maxDuration).to.be.bignumber.equal(shortTx.loanOffering.maxDuration);

  const balance = await shortSell.getShortBalance.call(shortId);

  const baseTokenFromSell = getPartialAmount(
    shortTx.buyOrder.makerTokenAmount,
    shortTx.buyOrder.takerTokenAmount,
    shortTx.shortAmount
  );

  expect(balance).to.be.bignumber.equal(baseTokenFromSell.plus(shortTx.depositAmount));

  const [
    underlyingToken,
    baseToken,
    feeToken
  ] = await Promise.all([
    UnderlyingToken.deployed(),
    BaseToken.deployed(),
    FeeToken.deployed()
  ]);

  const [
    lenderUnderlyingToken,
    makerUnderlyingToken,
    vaultUnderlyingToken,
    sellerBaseToken,
    makerBaseToken,
    vaultBaseToken,
    lenderFeeToken,
    makerFeeToken,
    vaultFeeToken,
    sellerFeeToken
  ] = await Promise.all([
    underlyingToken.balanceOf.call(shortTx.loanOffering.lender),
    underlyingToken.balanceOf.call(shortTx.buyOrder.maker),
    underlyingToken.balanceOf.call(Vault.address),
    baseToken.balanceOf.call(shortTx.seller),
    baseToken.balanceOf.call(shortTx.buyOrder.maker),
    baseToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(shortTx.loanOffering.lender),
    feeToken.balanceOf.call(shortTx.buyOrder.maker),
    feeToken.balanceOf.call(Vault.address),
    feeToken.balanceOf.call(shortTx.seller),
    feeToken.balanceOf.call(shortTx.buyOrder.feeRecipient),
    feeToken.balanceOf.call(shortTx.loanOffering.feeRecipient),
  ]);

  expect(lenderUnderlyingToken).to.be.bignumber.equal(
    shortTx.loanOffering.rates.maxAmount.minus(shortTx.shortAmount)
  );
  expect(makerUnderlyingToken).to.be.bignumber.equal(shortTx.shortAmount);
  expect(vaultUnderlyingToken).to.be.bignumber.equal(0);
  expect(sellerBaseToken).to.be.bignumber.equal(0);
  expect(makerBaseToken).to.be.bignumber.equal(
    shortTx.buyOrder.makerTokenAmount.minus(baseTokenFromSell)
  );
  expect(vaultBaseToken).to.be.bignumber.equal(baseTokenFromSell.plus(shortTx.depositAmount));
  expect(lenderFeeToken).to.be.bignumber.equal(
    shortTx.loanOffering.rates.lenderFee
      .minus(
        getPartialAmount(
          shortTx.shortAmount,
          shortTx.loanOffering.rates.maxAmount,
          shortTx.loanOffering.rates.lenderFee
        )
      )
  );
  expect(vaultFeeToken).to.be.bignumber.equal(0);
  expect(makerFeeToken).to.be.bignumber.equal(
    shortTx.buyOrder.makerFee
      .minus(
        getPartialAmount(
          shortTx.shortAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.buyOrder.makerFee
        )
      )
  );
  expect(sellerFeeToken).to.be.bignumber.equal(
    shortTx.loanOffering.rates.takerFee
      .plus(shortTx.buyOrder.takerFee)
      .minus(
        getPartialAmount(
          shortTx.shortAmount,
          shortTx.loanOffering.rates.maxAmount,
          shortTx.loanOffering.rates.takerFee
        )
      )
      .minus(
        getPartialAmount(
          shortTx.shortAmount,
          shortTx.buyOrder.takerTokenAmount,
          shortTx.buyOrder.takerFee
        )
      )
  );
}
