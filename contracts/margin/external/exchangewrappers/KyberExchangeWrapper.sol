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
/**
 *
 */

pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ERC20 }    from "../../../Kyber/ERC20Interface.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { KyberNetworkInterface } from "../../../interfaces/KyberNetworkInterface.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";


/**
 * @title KyberNetworkWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with 0x Version 1
 */
contract KyberExchangeWrapper is
    HasNoEther,
    HasNoContracts,
    OnlyMargin,
    ExchangeWrapper
{
    using SafeMath for uint256;

    // ============ Structs ============

    //0x order
    struct Order {
        address maker;
        address taker;
        address feeRecipient;
        uint256 makerTokenAmount;
        uint256 takerTokenAmount;
        uint256 makerFee;
        uint256 takerFee;
        uint256 expirationUnixTimestampSec;
        uint256 salt;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }
    //KyberOrder
    /**
     * [DYDX_PROXY description]
     * @type {[type]}
     * function trade (
        ERC20 source -- taker token
        uint srcAmount -- amount to taker
        ERC20 dest -- maker tokens
        address destAddress -- destiantion of taker
        uint maxDestAmount -- ONLY for exchangeforAmount, otherwise maxUint256
        uint minConversionRate -- set to 1 for now (later when building out the interface)
        address walletId -- set to 0 for now
     )
     */
    struct KyberOrder {
      uint srcAmount; //amount taker has to offer
      address taker; //destAddress
      uint maxDestAmount; //when using exchangeforAmount, otherwise max
    }

    // ============ State Variables ============

    address public DYDX_PROXY;
    address public KYBER_NETWORK;
    /* address public ZERO_EX_PROXY;
    address public ZRX; */

    // ============ Constructor ============

    constructor(
        address margin,
        address dydxProxy,
        address kyber_network
    )
        public
        OnlyMargin(margin)
    {
        DYDX_PROXY = dydxProxy;
        KYBER_NETWORK = kyber_network;
        // The ZRX token does not decrement allowance if set to MAX_UINT
        // therefore setting it once to the maximum amount is sufficient
        // NOTE: this is *not* standard behavior for an ERC20, so do not rely on it for other tokens
      //  TokenInteract.approve(ZRX, ZERO_EX_PROXY, MathHelpers.maxUint256());
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
     */
    function exchange(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        /* onlyMargin */
        returns (uint256)
        {
          KyberOrder memory order = parseOrder(orderData);

          uint256 receivedMakerTokenAmount = exchangeImpl(
            order,
            makerToken,
            takerToken,
            tradeOriginator,
            requestedFillAmount
            );
          return receivedMakerTokenAmount;
        }

    /**
     * Exchange takerToken for an exact amount of makerToken. Any extra makerToken exist
     * as a result of the trade will be left in the exchange wrapper
     *
     * @param  makerToken         Address of makerToken, the token to receive
     * @param  takerToken         Address of takerToken, the token to pay
     * @param  tradeOriginator    The msg.sender of the first call into the dYdX contract
     * @param  desiredMakerToken  Amount of makerToken requested
     * @param  orderData          Arbitrary bytes data for any information to pass to the exchange
     * @return                    The amount of takerToken used
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
        returns (uint256);

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
        returns (uint256);

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
        returns (uint256);


    // =========== Internal Functions ============
    function exchangeImpl(
      KyberOrder order,
      address makerToken,
      address takerToken,
      address tradeOriginator,
      uint256 requestedFillAmount
      )
      internal
      returns (uint256)
      {
        /**
         * for now, we are just going to fulfill the trade
         * w/o checks
         */
       assert(requestedFillAmount>0);
       require(
         requestedFillAmount <= order.srcAmount,
        "KyberNetworkWrapper#exchangeImpl: Requested fill amount larger than order size"
         );
        uint256 receivedMakerTokenAmount = doTrade(
                                            order,
                                            makerToken,
                                            takerToken,
                                            requestedFillAmount
                                                );
         return receivedMakerTokenAmount;
      }


   function doTrade(
     KyberOrder order,
     address makerToken,
     address takerToken,
     uint256 requestedFillAmount
     )
     internal
     returns (uint256)
    {
      /**
       * they are difficult and want to convert to erc20 ....
       */
      uint256 receivedMakerTokenAmount = KyberNetworkInterface(KYBER_NETWORK)
                                            .trade(
                                              ERC20(takerToken),
                                              requestedFillAmount,
                                              ERC20(makerToken),
                                              order.taker,
                                              MathHelpers.maxUint256(),
                                              1, //marketprice
                                              0 //because wallet is unknown
                                              );
        return receivedMakerTokenAmount;
    }

    function getConversionRate(
      address makerToken,
      address takerToken,
      uint256 requestedFillAmount
      )
      internal
      returns (uint256) {

      }

    /* struct KyberOrder {
      uint srcAmount; //amount taker has to offer
      address taker; //destAddress
      uint maxDestAmount; //when using exchangeforAmount, otherwise max
    } */
    function parseOrder(
      bytes orderData
      )
    internal
    pure
    returns (KyberOrder memory)
    {
      KyberOrder memory order;
      /**
       * Total: 384 bytes
       * mstore stores 32 bytes at a time, so go in increments of 32 bytes
       *
       * NOTE: The first 32 bytes in an array store the length, so we start reading from 32
       */
      assembly {
        mstore(order,            mload(add(orderData,32))) //srcAmount
        mstore(add(order,32),    mload(add(orderData,64))) //destAddress
        mstore(add(order,64),    mload(add(orderData,64))) //maxDestAmount
        }
      return order;
    }





}
