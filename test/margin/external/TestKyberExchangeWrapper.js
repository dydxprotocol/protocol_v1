/*global web3, artifacts, contract, describe, it*/

const chai = require('chai');
const expect = chai.expect;
chai.use(require('chai-bignumber')());
const BigNumber = require('bignumber.js');
const Web3 = require('web3');
const web3Instance = new Web3(web3.currentProvider);

const KyberExchangeWrapper = artifacts.require("KyberExchangeWrapper");
const KyberNetworkSimple = artifacts.require("KyberNetworkSimple");
const WETH9 = artifacts.require("WETH9");
const TokenA = artifacts.require("TokenA");

const { BIGNUMBERS, ADDRESSES } = require('../../helpers/Constants');
const { zeroExOrderToBytes } = require('../../helpers/BytesHelper');
const { createSignedSellOrder, signOrder } = require('../../helpers/ZeroExHelper');
const { getPartialAmount } = require('../../helpers/MathHelper');
const { issueAndSetAllowance } = require('../../helpers/TokenHelper');
const { expectThrow } = require('../../helpers/ExpectHelper');

const baseAmount = new BigNumber('1e18');

describe('KyberExchangeWrapper', () => {
  describe('Constructor', () => {
    contract('KyberExchangeWrapper' , accounts => {
      it('sets constants correctly', async () => {
        const {
          dydxMargin,
          dydxProxy,
          kyberProxy,
          exchangeWrapper,
          WETHToken
        } = await setup(accounts);

        const [
          DYDX_PROXY,
          KYBER_NETWORK,
          WRAPPED_ETH,
          DYDX_MARGIN
        ] = await Promise.all([
          exchangeWrapper.DYDX_PROXY.call(),
          exchangeWrapper.KYBER_NETWORK.call(),
          exchangeWrapper.WRAPPED_ETH.call(),
          exchangeWrapper.DYDX_MARGIN.call()
        ]);

        expect(DYDX_PROXY).to.eq(dydxProxy);
        expect(DYDX_MARGIN).to.eq(dydxMargin);
        expect(KYBER_NETWORK).to.eq(KyberNetworkSimple.address);
        expect(WRAPPED_ETH).to.eq(WETHToken.address);

      })
    })
  })
  describe('#getTradeMakerTokenAmount', () => {
    contract('KyberExchangeWrapper', accounts => {
      it('gives the correct maker token for a given order', async () => {
        const {
          exchangeWrapper
        } = await setup(accounts);
        //get KyberNetwork, takerToken, WETH
        const KyberNetwork = await KyberNetworkSimple.deployed();
        const takerToken = await TokenA.deployed();
        const tokenAmount = 60;
        //issue 60 tokens to the exchangeWrapper
        issueAndSetAllowance(
          takerToken,
          exchangeWrapper,
          tokenAmount,

        )

      //   //add 50ETH to KyberNetwork
      //   await web3Instance.eth.sendTransaction({
      //     to: KyberNetwork.address,
      //     from: accounts[0],
      //     value: baseAmount.times(50)
      //   })
      //
      // //  console.log(KyberNetwork);
      //   const KyberBalance = await KyberNetwork.getBalance.call();
      //   //console.log(KyberBalance.toString(10))
      //   //check if the contract has the 50 ether
      //   expect(KyberBalance.toString(10)).to.eq(baseAmount.times(50).toString(10));
      //   // mint 60 tokens for the exchanger


      });
    });
  });
  // describe('#getTakerTokenPrice', () => {
  //   contract('KyberExchangeWrapper', accounts => {
  //     it('gives the correct maker token for a given order', async () => {
  //       const {
  //         exchangeWrapper
  //       } = await setup(accounts);
  //
  //       const order = await createSignedSellOrder(accounts);
  //       const amount = new BigNumber(baseAmount.times(2));
  //
  //       const requiredTakerTokenAmount = await exchangeWrapper.getTakerTokenPrice.call(
  //         order.makerTokenAddress,
  //         order.takerTokenAddress,
  //         amount,
  //         zeroExOrderToBytes(order)
  //       );
  //
  //       const expected = getPartialAmount(
  //         order.takerTokenAmount,
  //         order.makerTokenAmount,
  //         amount,
  //         true
  //       );
  //
  //       expect(requiredTakerTokenAmount).to.be.bignumber.eq(expected);
  //     });
  //   });
  // });
  //
  // describe('#exchange', () => {
  //   contract('ZeroExExchangeWrapper', accounts => {
  //     it('successfully executes a trade', async () => {
  //       const {
  //         exchangeWrapper,
  //         tradeOriginator,
  //         dydxMargin,
  //         dydxProxy
  //       } = await setup(accounts);
  //
  //       const order = await createSignedSellOrder(accounts);
  //
  //       const amount = new BigNumber(baseAmount.times(2));
  //
  //       await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
  //
  //       const startingBalances = await getBalances(
  //         order,
  //         exchangeWrapper,
  //         tradeOriginator,
  //         dydxProxy
  //       );
  //
  //       await exchangeWrapper.exchange(
  //         order.makerTokenAddress,
  //         order.takerTokenAddress,
  //         tradeOriginator,
  //         amount,
  //         zeroExOrderToBytes(order),
  //         { from: dydxMargin }
  //       );
  //
  //       await validateBalances(
  //         startingBalances,
  //         order,
  //         exchangeWrapper,
  //         tradeOriginator,
  //         amount,
  //         dydxProxy
  //       );
  //     });
  //   });
  //
  //   contract('ZeroExExchangeWrapper', accounts => {
  //     it('successfully executes multiple trades', async () => {
  //       const {
  //         exchangeWrapper,
  //         tradeOriginator,
  //         dydxMargin,
  //         dydxProxy
  //       } = await setup(accounts);
  //
  //       const order = await createSignedSellOrder(accounts);
  //
  //       let amount = new BigNumber(baseAmount.times(2));
  //
  //       await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
  //
  //       let startingBalances = await getBalances(
  //         order,
  //         exchangeWrapper,
  //         tradeOriginator,
  //         dydxProxy
  //       );
  //
  //       await exchangeWrapper.exchange(
  //         order.makerTokenAddress,
  //         order.takerTokenAddress,
  //         tradeOriginator,
  //         amount,
  //         zeroExOrderToBytes(order),
  //         { from: dydxMargin }
  //       );
  //
  //       await validateBalances(
  //         startingBalances,
  //         order,
  //         exchangeWrapper,
  //         tradeOriginator,
  //         amount,
  //         dydxProxy
  //       );
  //
  //       amount = new BigNumber(baseAmount.times(1.5));
  //       await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
  //       startingBalances = await getBalances(
  //         order,
  //         exchangeWrapper,
  //         tradeOriginator,
  //         dydxProxy
  //       );
  //
  //       await exchangeWrapper.exchange(
  //         order.makerTokenAddress,
  //         order.takerTokenAddress,
  //         tradeOriginator,
  //         amount,
  //         zeroExOrderToBytes(order),
  //         { from: dydxMargin }
  //       );
  //
  //       await validateBalances(
  //         startingBalances,
  //         order,
  //         exchangeWrapper,
  //         tradeOriginator,
  //         amount,
  //         dydxProxy
  //       );
  //
  //       amount = new BigNumber(baseAmount.times(1.2));
  //       await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
  //       startingBalances = await getBalances(
  //         order,
  //         exchangeWrapper,
  //         tradeOriginator,
  //         dydxProxy
  //       );
  //
  //       await exchangeWrapper.exchange(
  //         order.makerTokenAddress,
  //         order.takerTokenAddress,
  //         tradeOriginator,
  //         amount,
  //         zeroExOrderToBytes(order),
  //         { from: dydxMargin }
  //       );
  //
  //       await validateBalances(
  //         startingBalances,
  //         order,
  //         exchangeWrapper,
  //         tradeOriginator,
  //         amount,
  //         dydxProxy
  //       );
  //     });
  //   });
  //
  //   contract('ZeroExExchangeWrapper', accounts => {
  //     it('does not transfer taker fee when 0 feeRecipient', async () => {
  //       const {
  //         exchangeWrapper,
  //         tradeOriginator,
  //         dydxMargin,
  //         dydxProxy
  //       } = await setup(accounts);
  //
  //       const order = await createSignedSellOrder(accounts);
  //
  //       order.feeRecipient = ADDRESSES.ZERO;
  //       order.ecSignature = await signOrder(order);
  //
  //       const amount = new BigNumber(baseAmount.times(2));
  //
  //       await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
  //
  //       const startingBalances = await getBalances(
  //         order,
  //         exchangeWrapper,
  //         tradeOriginator,
  //         dydxProxy
  //       );
  //
  //       await exchangeWrapper.exchange(
  //         order.makerTokenAddress,
  //         order.takerTokenAddress,
  //         tradeOriginator,
  //         amount,
  //         zeroExOrderToBytes(order),
  //         { from: dydxMargin }
  //       );
  //
  //       await validateBalances(
  //         startingBalances,
  //         order,
  //         exchangeWrapper,
  //         tradeOriginator,
  //         amount,
  //         dydxProxy
  //       );
  //     });
  //   });
  //
  //   contract('ZeroExExchangeWrapper', accounts => {
  //     it('fails if order is too small', async () => {
  //       const {
  //         exchangeWrapper,
  //         tradeOriginator,
  //         dydxMargin
  //       } = await setup(accounts);
  //
  //       const order = await createSignedSellOrder(accounts);
  //
  //       const amount = new BigNumber(order.takerTokenAmount.plus(1));
  //
  //       await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
  //
  //       await expectThrow(exchangeWrapper.exchange(
  //         order.makerTokenAddress,
  //         order.takerTokenAddress,
  //         tradeOriginator,
  //         amount,
  //         zeroExOrderToBytes(order),
  //         { from: dydxMargin }
  //       ));
  //     });
  //   });
  //
  //   contract('ZeroExExchangeWrapper', accounts => {
  //     it('fails if order has already been filled', async () => {
  //       const {
  //         exchangeWrapper,
  //         tradeOriginator,
  //         dydxMargin
  //       } = await setup(accounts);
  //
  //       const order = await createSignedSellOrder(accounts);
  //
  //       const amount = new BigNumber(order.takerTokenAmount.times(2).div(3).floor());
  //
  //       await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
  //
  //       await exchangeWrapper.exchange(
  //         order.makerTokenAddress,
  //         order.takerTokenAddress,
  //         tradeOriginator,
  //         amount,
  //         zeroExOrderToBytes(order),
  //         { from: dydxMargin }
  //       );
  //
  //       await grantTokens(order, exchangeWrapper, tradeOriginator, amount);
  //
  //       await expectThrow(exchangeWrapper.exchange(
  //         order.makerTokenAddress,
  //         order.takerTokenAddress,
  //         tradeOriginator,
  //         amount,
  //         zeroExOrderToBytes(order),
  //         { from: dydxMargin }
  //       ));
  //     });
  //   });
  //
  //   describe('#exchangeForAmount', () => {
  //     contract('ZeroExExchangeWrapper', accounts => {
  //       it('successfully executes a trade for a specific amount', async () => {
  //         const {
  //           exchangeWrapper,
  //           tradeOriginator,
  //           dydxMargin,
  //           dydxProxy
  //         } = await setup(accounts);
  //
  //         const order = await createSignedSellOrder(accounts);
  //
  //         const desiredAmount = new BigNumber(baseAmount.times(2));
  //         const takerAmount = getPartialAmount(
  //           order.takerTokenAmount,
  //           order.makerTokenAmount,
  //           desiredAmount,
  //           true
  //         );
  //
  //         await grantTokens(order, exchangeWrapper, tradeOriginator, takerAmount);
  //
  //         const startingBalances = await getBalances(
  //           order,
  //           exchangeWrapper,
  //           tradeOriginator,
  //           dydxProxy
  //         );
  //
  //         await exchangeWrapper.exchangeForAmount(
  //           order.makerTokenAddress,
  //           order.takerTokenAddress,
  //           tradeOriginator,
  //           desiredAmount,
  //           zeroExOrderToBytes(order),
  //           { from: dydxMargin }
  //         );
  //
  //         await validateBalances(
  //           startingBalances,
  //           order,
  //           exchangeWrapper,
  //           tradeOriginator,
  //           takerAmount,
  //           dydxProxy
  //         );
  //       });
  //     });
  //   });
  // });
});

//================ Helper Functions ====================
async function setup(accounts) {
  const dydxMargin = accounts[1];
  const dydxProxy = accounts[2];
  const tradeOriginator = accounts[3];
  const kyberProxy = accounts[4]

  const WETHToken = await WETH9.deployed();
  //Need to set the conversion rates on it to check if trade works
  const KyberNetwork = await KyberNetworkSimple.deployed();

  const exchangeWrapper = await KyberExchangeWrapper.new(
    dydxMargin,
    dydxProxy,
    KyberNetworkSimple.address,
    WETHToken.address
  );
  return {
    dydxMargin,
    dydxProxy,
    exchangeWrapper,
    kyberProxy,
    KyberNetwork,
    WETHToken,
    tradeOriginator
  }
}

// async function grantTokens(order, exchangeWrapper, tradeOriginator, amount) {
//   const [makerToken, takerToken, feeToken] = await Promise.all([
//     TestToken.at(order.makerTokenAddress),
//     TestToken.at(order.takerTokenAddress),
//     FeeToken.deployed()
//   ]);
//
//   await Promise.all([
//     // Maker Token
//     issueAndSetAllowance(
//       makerToken,
//       order.maker,
//       order.makerTokenAmount,
//       ZeroExProxy.address
//     ),
//
//     // Taker Token
//     takerToken.issueTo(exchangeWrapper.address, amount),
//
//     // Maker Fee Token
//     issueAndSetAllowance(
//       feeToken,
//       order.maker,
//       order.makerFee,
//       ZeroExProxy.address
//     ),
//
//     // Taker Fee Token
//     issueAndSetAllowance(
//       feeToken,
//       tradeOriginator,
//       order.takerFee,
//       exchangeWrapper.address
//     )
//   ]);
// }
//
// async function getBalances(order, exchangeWrapper, tradeOriginator, dydxProxy) {
//   const [makerToken, takerToken, feeToken] = await Promise.all([
//     TestToken.at(order.makerTokenAddress),
//     TestToken.at(order.takerTokenAddress),
//     FeeToken.deployed()
//   ]);
//
//   const [
//     makerMakerToken,
//     makerTakerToken,
//     makerFeeToken,
//
//     exchangeWrapperMakerToken,
//     exchangeWrapperTakerToken,
//     exchangeWrapperFeeToken,
//
//     feeRecipientFeeToken,
//
//     tradeOriginatorFeeToken,
//
//     exchangeWrapperProxyAllowance
//   ] = await Promise.all([
//     makerToken.balanceOf.call(order.maker),
//     takerToken.balanceOf.call(order.maker),
//     feeToken.balanceOf.call(order.maker),
//
//     makerToken.balanceOf.call(exchangeWrapper.address),
//     takerToken.balanceOf.call(exchangeWrapper.address),
//     feeToken.balanceOf.call(exchangeWrapper.address),
//
//     feeToken.balanceOf.call(order.feeRecipient),
//
//     feeToken.balanceOf.call(tradeOriginator),
//
//     makerToken.allowance.call(exchangeWrapper.address, dydxProxy)
//   ]);
//
//   return {
//     makerMakerToken,
//     makerTakerToken,
//     makerFeeToken,
//
//     exchangeWrapperMakerToken,
//     exchangeWrapperTakerToken,
//     exchangeWrapperFeeToken,
//
//     feeRecipientFeeToken,
//
//     tradeOriginatorFeeToken,
//
//     exchangeWrapperProxyAllowance
//   };
// }
//
// async function validateBalances(
//   startingBalances,
//   order,
//   exchangeWrapper,
//   tradeOriginator,
//   amount,
//   dydxProxy
// ) {
//   const {
//     makerMakerToken,
//     makerTakerToken,
//     makerFeeToken,
//
//     exchangeWrapperMakerToken,
//     exchangeWrapperTakerToken,
//     exchangeWrapperFeeToken,
//
//     feeRecipientFeeToken,
//
//     tradeOriginatorFeeToken,
//
//     exchangeWrapperProxyAllowance
//   } = await getBalances(order, exchangeWrapper, tradeOriginator, dydxProxy);
//
//   const tradedMakerToken = getPartialAmount(
//     amount,
//     order.takerTokenAmount,
//     order.makerTokenAmount
//   );
//   const makerFee = order.feeRecipient === ADDRESSES.ZERO ? BIGNUMBERS.ZERO : getPartialAmount(
//     amount,
//     order.takerTokenAmount,
//     order.makerFee
//   );
//   const takerFee = order.feeRecipient === ADDRESSES.ZERO ? BIGNUMBERS.ZERO : getPartialAmount(
//     amount,
//     order.takerTokenAmount,
//     order.takerFee
//   );
//
//   // Maker Balances
//   expect(makerMakerToken).to.be.bignumber.eq(
//     startingBalances.makerMakerToken.minus(tradedMakerToken)
//   );
//   expect(makerTakerToken).to.be.bignumber.eq(
//     startingBalances.makerTakerToken.plus(amount)
//   );
//   expect(makerFeeToken).to.be.bignumber.eq(
//     startingBalances.makerFeeToken.minus(makerFee)
//   );
//
//   // Exchange Wrapper Balances
//   expect(exchangeWrapperMakerToken).to.be.bignumber.eq(
//     startingBalances.exchangeWrapperMakerToken.plus(tradedMakerToken)
//   );
//   expect(exchangeWrapperTakerToken).to.be.bignumber.eq(0);
//   expect(exchangeWrapperFeeToken).to.be.bignumber.eq(0);
//
//   // Fee Recipient Balance
//   expect(feeRecipientFeeToken).to.be.bignumber.eq(
//     startingBalances.feeRecipientFeeToken.plus(makerFee.plus(takerFee))
//   );
//
//   // Trade Originator Balance
//   expect(tradeOriginatorFeeToken).to.be.bignumber.eq(
//     startingBalances.tradeOriginatorFeeToken.minus(takerFee)
//   );
//
//   // Exchange Wrapper Proxy Allowance
//   expect(exchangeWrapperProxyAllowance).to.be.bignumber.gte(tradedMakerToken);
// }
