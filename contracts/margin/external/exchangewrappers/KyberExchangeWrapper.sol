/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ERC20 }    from "../../../external/kyber/ERC20Interface.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { KyberExchangeInterface } from "../../../external/kyber/KyberExchangeInterface.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";
import { WETH9 } from "../../../external/WETH9.sol";


/**
 * @title KyberExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with KyberNetwork
 */
contract KyberExchangeWrapper is
    HasNoContracts,
    OnlyMargin,
    ExchangeWrapper
{
    using SafeMath for uint256;



    // ============ Structs ============
    /**
     * walletId -- id of the service provider. if unsure, put 0
     * srcAmount -- amount of tokens to convert. if ETH, needs to be equal to msg.value
     * maxDestAmount -- maximum amount of tokens to convert, this value takes place of desiredMakerToken
            when specified in exchangeForAmount()
     * minConversionRate -- minimal conversion rate, if this value is 1, then it will set it at the marketPrice
     */
    struct Order {
      address walletId;
      /* uint srcAmount; //amount taker has to offer
      uint maxDestAmount; //when using exchangeforAmount, if 0 then maxUint256 */
      uint256 minConversionRate; //1 for market price if not given
    }

    // ============ State Variables ============
    address public ETH_TOKEN_ADDRESS = 0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;
    address public DYDX_PROXY;
    address public KYBER_NETWORK;
    address public WRAPPED_ETH;

    // ============ Constructor ============

    constructor(
        address margin,
        address dydxProxy,
        address kyber_network,
        address wrapped_eth
    )
        public
        OnlyMargin(margin)
    {
        DYDX_PROXY = dydxProxy;
        KYBER_NETWORK = kyber_network;
        WRAPPED_ETH = wrapped_eth;
    }

    // ============ Margin-Only Functions ============
    /**
     * Exchange some amount of takerToken for makerToken.
     *
     * @param  makerToken           Address of makerToken, the token to receive
     * @param  takerToken           Address of takerToken, the token to pay
     * @param  tradeOriginator      The msg.sender of the first call into the dYdX contract
     * @param  requestedFillAmount  Amount of takerToken being paid
     * @param  orderData            Arbitrary bytes data for any information to pass to the exchange
     * @return                      The amount of makerToken received
     I need to find out a way to check whether or not either the maker
     or taker token are actually wrapped ether

     */
    function exchange(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        onlyMargin
        returns (uint256)
        {
          Order memory order = parseOrder(orderData);
          assert(TokenInteract.balanceOf(takerToken, address(this)) >= requestedFillAmount);
          assert(requestedFillAmount > 0);
          //check if maker or taker are wrapped eth (but they cant both be ;))
          require( (makerToken != takerToken) && (makerToken == WRAPPED_ETH || takerToken == WRAPPED_ETH));
          uint256 receivedMakerTokenAmount;
          // 1st scenario: takerToken is Eth, and should be sent appropriately
          if (takerToken == WRAPPED_ETH) {
              receivedMakerTokenAmount = exchangeFromWETH(
                     order,
                    makerToken,
                     requestedFillAmount,
                    false
                );
          }
          if (makerToken == WRAPPED_ETH) {
              receivedMakerTokenAmount = exchangeToWETH(
                 order,
                 takerToken,
                 requestedFillAmount,
                 false
                );
          }
          ensureAllowance(
            makerToken,
            DYDX_PROXY,
            receivedMakerTokenAmount
            );
          return receivedMakerTokenAmount;
        }

    /**
        Exchange for amount has the same exact implementation as exchange,
        only that the maxDestAmount is not set as the Maximum integer but rather
        the user given desiredAmount in the Order
     */
    function exchangeForAmount(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        /* onlyMargin */
        returns (uint256)
          {
            Order memory order = parseOrder(orderData);
            //check if maker or taker are wrapped eth (but they cant both be ;))
            require( (makerToken != takerToken) && (makerToken == WRAPPED_ETH || takerToken == WRAPPED_ETH) );
            uint256 receivedMakerTokenAmount;
            //getConversionRatePerToken
            uint256 conversionRate = getConversionRatePerToken(makerToken, takerToken);
            //multiply by desiredMakerToken to get requestedFillAmount
            uint256 requestedFillAmount = conversionRate.mul(desiredMakerToken);
            //
            assert(TokenInteract.balanceOf(takerToken,address(this)) >= requestedFillAmount);
            // 1st scenario: takerToken is Eth, and should be sent appropriately
            if (takerToken == WRAPPED_ETH) {
                  receivedMakerTokenAmount = exchangeFromWETH(
                      order,
                      makerToken,
                      desiredMakerToken,
                      true
                  );
            }
            if (makerToken == WRAPPED_ETH) {
                  receivedMakerTokenAmount = exchangeToWETH(
                    order,
                    takerToken,
                    desiredMakerToken,
                    true
                    );
            }
            assert(receivedMakerTokenAmount >= desiredMakerToken);
            ensureAllowance(
              makerToken,
              DYDX_PROXY,
              desiredMakerToken
              );
            return receivedMakerTokenAmount;
          }

    // ============ Public Constant Functions ========
    /**
     * Get amount of makerToken that will be paid out by exchange for a given trade. Should match
     * the amount of makerToken returned by exchange
     *
     * @param  makerToken           Address of makerToken, the token to receive
     * @param  takerToken           Address of takerToken, the token to pay
     * @param  requestedFillAmount  Amount of takerToken being paid
     * @param  orderData            Arbitrary bytes data for any information to pass to the exchange
     * @return                      The amount of makerToken that would be received as a result of
     *                              taking this trade
     */
    function getTradeMakerTokenAmount(
        address makerToken,
        address takerToken,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        view
        returns (uint256) {
          Order memory order = parseOrder(orderData);
          //before called, one of these token pairs needs to be WETH
          require( (makerToken != takerToken) && (makerToken == WRAPPED_ETH || takerToken == WRAPPED_ETH));
          uint256 conversionRate;
          if(makerToken == WRAPPED_ETH) {
            conversionRate = getConversionRate(
                               takerToken,
                               ETH_TOKEN_ADDRESS,
                               requestedFillAmount
              );
          } else if(takerToken == WRAPPED_ETH) {
            conversionRate = getConversionRate(
                              ETH_TOKEN_ADDRESS,
                              makerToken,
                              requestedFillAmount
              );
          }
          return conversionRate;
        }

    /**
     *this function will query the getExpectedRate() function from the KyberNetworkWrapper
     * and return the slippagePrice, which is the worst case scenario for accuracy and ETH_TOKEN_ADDRESS
     * will multiply it by the desiredAmount
     */
    function getTakerTokenPrice(
        address makerToken,
        address takerToken,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        view
        returns (uint256)
         {
           //before called, one of these token pairs needs to be WETH
           require((makerToken != takerToken) && (makerToken == WRAPPED_ETH || takerToken == WRAPPED_ETH));

           uint256 conversionRate = getConversionRatePerToken(makerToken,takerToken);

           uint256 takerTokenPrice = conversionRate.mul(desiredMakerToken);

           return takerTokenPrice;
         }

    /* function trade (
           ERC20 source -- taker token
           uint srcAmount -- amount to taker
           ERC20 dest -- maker tokens
           address destAddress -- destiantion of taker
           uint maxDestAmount -- ONLY for exchangeforAmount, otherwise maxUint256
           uint minConversionRate -- set to 1 for now (later when building out the interface)
           address walletId -- set to 0 for now
        ) */


    // =========== Internal Functions ============
    function exchangeFromWETH(
              Order order,
              address makerToken,
              uint256 requestedFillAmount,
              bool exactAmount
          )
          internal
          returns (uint256) {
              //unwrap ETH
              WETH9(WRAPPED_ETH).withdraw(requestedFillAmount);
              //dummy check to see if it sent through
              require(address(this).balance > 0 );
              //send trade through
              uint256 receivedMakerTokenAmount = KyberExchangeInterface(KYBER_NETWORK).trade.value(msg.value)(
               ERC20(ETH_TOKEN_ADDRESS),
               address(this).balance,
               ERC20(makerToken),
               address(this),
               (exactAmount ? requestedFillAmount : MathHelpers.maxUint256()),
               order.minConversionRate,
               order.walletId
                  );
            return receivedMakerTokenAmount;
          }

     function exchangeToWETH(
            Order order,
            address takerToken,
            uint256 requestedFillAmount,
            bool exactAmount
      )
      internal
      returns (uint256) {


        //received ETH in wei
        uint receivedMakerTokenAmount = KyberExchangeInterface(KYBER_NETWORK).trade(
          ERC20(takerToken),
          requestedFillAmount,
          ERC20(ETH_TOKEN_ADDRESS),
          address(this),
          (exactAmount ? requestedFillAmount : MathHelpers.maxUint256()),
          order.minConversionRate,
          order.walletId
          );
        //dummy check to see if eth was actually sent
        require(address(this).balance > 0);
        WETH9(WRAPPED_ETH).deposit.value(msg.value);
        return receivedMakerTokenAmount;
       }
      /**
       * [getConversionRate description]
       * makerToken -- token to be received
       * takerToken -- token to be paid in
       * requestedFillAmount -- quantity to check the rate against
       * @return rate -- this function will return the expectedPrice
       if transfering to ETH, they will be expected to pay
       expectedPrice/10**18 ETH, and at worst
       slippagePrice/10**18 ETH, and this function returns the expectedPrice
       */
     function getConversionRate(
      address makerToken,
      address takerToken,
      uint256 requestedFillAmount
     )
        internal
        view
        returns (uint)
      {
        uint expectedPrice;
        (expectedPrice,) = KyberExchangeInterface(KYBER_NETWORK).getExpectedRate(
                                  ERC20(takerToken),
                                  ERC20(makerToken),
                                  requestedFillAmount);
        return expectedPrice;
      }

    /**
     * getConversionRatePerToken
      returns the conversionRate for 1 token,
      this is called for getTakerTokenPrice and exchangeForAmount

     */
    function getConversionRatePerToken(
      address makerToken,
      address takerToken
      )
      internal
      view
      returns(uint256 conRate)
    {
        uint256 conversionRate;
        if (makerToken == WRAPPED_ETH) {
          conversionRate = getConversionRate(
                            takerToken,
                             ETH_TOKEN_ADDRESS,
                             1
            );
        } else if (takerToken == WRAPPED_ETH) {
          conversionRate = getConversionRate(
                            ETH_TOKEN_ADDRESS,
                            makerToken,
                            1
            );
        }
        return conversionRate;
      }

    function ensureAllowance(
        address token,
        address spender,
        uint256 requiredAmount
      )
          internal
      {
          if (TokenInteract.allowance(token,address(this),spender) >= requiredAmount) {
            return;
          }

          TokenInteract.approve(
            token,
            spender,
            MathHelpers.maxUint256()
          );
      }

  // ============ Parsing Functions ============

    /**
      * Accepts a byte array with each variable padded to 32 bytes
      struct Order {
        address walletId;
        uint256 minConversionRate; //1 for market price if not given
      }
      */
    function parseOrder(
      bytes orderData
      )
    internal
    pure
    returns (Order memory)
    {
      Order memory order;
      /**
       * Total: 64 bytes
       * mstore stores 32 bytes at a time, so go in increments of 32 bytes
       *
       * NOTE: The first 32 bytes in an array store the length, so we start reading from 32
       */
      assembly {
        mstore(order,             mload(add(orderData,32))) //walletId
        mstore(add(order,32),     mload(add(orderData,64))) //minConversionRate
        }
      return order;
    }

}
