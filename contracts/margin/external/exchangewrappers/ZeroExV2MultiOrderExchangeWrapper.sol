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

pragma solidity 0.4.24;
pragma experimental "v0.5.0";
pragma experimental ABIEncoderV2;

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { IExchange } from "../../../external/0x/v2/interfaces/IExchange.sol";
import { LibFillResults } from "../../../external/0x/v2/libs/LibFillResults.sol";
import { LibOrder } from "../../../external/0x/v2/libs/LibOrder.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";


/**
 * @title ZeroExV2MultiOrderExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with 0x Version 2. Sends multiple orders at once. Assumes no
 * fees.
 */
contract ZeroExV2MultiOrderExchangeWrapper is
    LibFillResults,
    LibOrder,
    ExchangeWrapper
{
    using SafeMath for uint256;
    using TokenInteract for address;

    // ============ Constants ============

    // number of bytes in the maxPrice data
    uint256 constant PRICE_DATA_LENGTH = 64;

    // number of bytes per (order+signature)
    uint256 constant ORDER_DATA_LENGTH = 322;

    // ============ Structs ============

    struct TokenAmounts {
        uint256 takerAmount;
        uint256 makerAmount;
    }

    // ============ State Variables ============

    // address of the ZeroEx V2 Exchange
    address public ZERO_EX_EXCHANGE;

    // address of the ZeroEx V2 ERC20Proxy
    address public ZERO_EX_TOKEN_PROXY;

    // ============ Constructor ============

    constructor(
        address zeroExExchange,
        address zeroExProxy
    )
        public
    {
        ZERO_EX_EXCHANGE = zeroExExchange;
        ZERO_EX_TOKEN_PROXY = zeroExProxy;
    }

    // ============ Public Functions ============

    function exchange(
        address /* tradeOriginator */,
        address receiver,
        address makerToken,
        address takerToken,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        returns (uint256)
    {
        // parse all order data
        validateOrderData(orderData);
        TokenAmounts memory priceRatio = parseMaxPriceRatio(orderData);
        Order[] memory orders = parseOrders(orderData, makerToken, takerToken);
        bytes[] memory signatures = parseSignatures(orderData);

        // ensure that the exchange can take the tokens from this contract
        ensureAllowance(
            takerToken,
            ZERO_EX_TOKEN_PROXY,
            requestedFillAmount
        );

        // do the exchange
        FillResults memory totalFillResults = IExchange(ZERO_EX_EXCHANGE).marketSellOrdersNoThrow(
            orders,
            requestedFillAmount,
            signatures
        );

        // validate that all taker tokens were sold
        require(
            totalFillResults.takerAssetFilledAmount == requestedFillAmount,
            "ZeroExV2MultiOrderExchangeWrapper#exchange: Cannot sell enough taker token"
        );

        // validate that max price is not violated
        validateTradePrice(
            priceRatio,
            totalFillResults.takerAssetFilledAmount,
            totalFillResults.makerAssetFilledAmount
        );

        // set allowance
        ensureAllowance(makerToken, receiver, totalFillResults.makerAssetFilledAmount);

        return totalFillResults.makerAssetFilledAmount;
    }

    function getExchangeCost(
        address makerToken,
        address takerToken,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        view
        returns (uint256)
    {
        // parse all orders
        validateOrderData(orderData);
        TokenAmounts memory priceRatio = parseMaxPriceRatio(orderData);
        Order[] memory orders = parseOrders(orderData, makerToken, takerToken);

        // keep running count of how much takerToken is needed until desiredMakerToken is acquired
        TokenAmounts memory running;
        running.takerAmount = 0;
        running.makerAmount = desiredMakerToken;

        // for all orders
        for (uint256 i = 0; i < orders.length && running.makerAmount != 0; i++) {
            Order memory order = orders[i];

            // get order info
            OrderInfo memory info = IExchange(ZERO_EX_EXCHANGE).getOrderInfo(order);

            // ignore unfillable orders
            if (info.orderStatus != uint8(OrderStatus.FILLABLE)) {
                continue;
            }

            // calculate the remaining taker and maker amounts in the order
            TokenAmounts memory remaining;
            remaining.takerAmount = order.takerAssetAmount.sub(info.orderTakerAssetFilledAmount);
            remaining.makerAmount = MathHelpers.getPartialAmount(
                remaining.takerAmount,
                order.takerAssetAmount,
                order.makerAssetAmount
            );

            // bound the remaining amounts by the maker amount still needed
            if (remaining.makerAmount > running.makerAmount) {
                remaining.makerAmount = running.makerAmount;
                remaining.takerAmount = MathHelpers.getPartialAmountRoundedUp(
                    order.takerAssetAmount,
                    order.makerAssetAmount,
                    remaining.makerAmount
                );
            }

            // update the running tallies
            running.takerAmount = running.takerAmount.add(remaining.takerAmount);
            running.makerAmount = running.makerAmount.sub(remaining.makerAmount);
        }

        // require that all amount was bought
        require(
            running.makerAmount == 0,
            "ZeroExV2MultiOrderExchangeWrapper#getExchangeCost: Cannot buy enough maker token"
        );

        // validate that max price will not be violated
        validateTradePrice(
            priceRatio,
            running.takerAmount,
            desiredMakerToken
        );

        // return the amount of taker token needed
        return running.takerAmount;
    }

    // ============ Private Functions ============

    function ensureAllowance(
        address token,
        address spender,
        uint256 requiredAmount
    )
        private
    {
        if (token.allowance(address(this), spender) >= requiredAmount) {
            return;
        }

        token.approve(
            spender,
            MathHelpers.maxUint256()
        );
    }

    function validateTradePrice(
        TokenAmounts memory priceRatio,
        uint256 takerAmount,
        uint256 makerAmount
    )
        private
        pure
    {
        require(
            priceRatio.makerAmount == 0 ||
            takerAmount.mul(priceRatio.makerAmount) <= makerAmount.mul(priceRatio.takerAmount),
            "ZeroExV2MultiOrderExchangeWrapper#validateTradePrice: Price greater than maxPrice"
        );
    }

    // ============ Order-Data Parsing Functions ============

    function validateOrderData(
        bytes memory orderData
    )
        private
        pure
    {
        require(
            orderData.length >= PRICE_DATA_LENGTH + ORDER_DATA_LENGTH
            && orderData.length.sub(PRICE_DATA_LENGTH) % ORDER_DATA_LENGTH == 0,
            "ZeroExV2MultiOrderExchangeWrapper#parseOrder: Invalid orderData length"
        );
    }

    function parseNumOrders(
        bytes memory orderData
    )
        private
        pure
        returns (uint256)
    {
        return orderData.length.sub(PRICE_DATA_LENGTH).div(ORDER_DATA_LENGTH);
    }

    function getOrderDataOffset(
        uint256 index
    )
        private
        pure
        returns (uint256)
    {
        return PRICE_DATA_LENGTH + index * ORDER_DATA_LENGTH;
    }

    function parseMaxPriceRatio(
        bytes memory orderData
    )
        private
        pure
        returns (TokenAmounts memory)
    {
        uint256 takerAmountRatio = 0;
        uint256 makerAmountRatio = 0;

        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            takerAmountRatio := mload(add(orderData, 32))
            makerAmountRatio := mload(add(orderData, 64))
        }

        // require numbers to fit within 128 bits to prevent overflow when checking bounds
        require(
            uint128(takerAmountRatio) == takerAmountRatio,
            "ZeroExV2MultiOrderExchangeWrapper#parseMaxPrice: takerAmountRatio > 128 bits"
        );
        require(
            uint128(makerAmountRatio) == makerAmountRatio,
            "ZeroExV2MultiOrderExchangeWrapper#parseMaxPrice: makerAmountRatio > 128 bits"
        );

        return TokenAmounts({
            takerAmount: takerAmountRatio,
            makerAmount: makerAmountRatio
        });
    }

    function parseSignatures(
        bytes memory orderData
    )
        private
        pure
        returns (bytes[] memory)
    {
        uint256 numOrders = parseNumOrders(orderData);
        bytes[] memory signatures = new bytes[](numOrders);

        for (uint256 i = 0; i < numOrders; i++) {
            // allocate new memory and cache pointer to it
            signatures[i] = new bytes(66);
            bytes memory signature = signatures[i];

            uint256 dataOffset = getOrderDataOffset(i);

            /* solium-disable-next-line security/no-inline-assembly */
            assembly {
                mstore(add(signature, 32), mload(add(add(orderData, 288), dataOffset))) // first 32 bytes of sig
                mstore(add(signature, 64), mload(add(add(orderData, 320), dataOffset))) // next 32 bytes of sig
                mstore(add(signature, 66), mload(add(add(orderData, 322), dataOffset))) // last 2 bytes of sig
            }
        }

        return signatures;
    }

    function parseOrders(
        bytes memory orderData,
        address makerToken,
        address takerToken
    )
        private
        pure
        returns (Order[] memory)
    {
        uint256 numOrders = parseNumOrders(orderData);
        Order[] memory orders = new Order[](numOrders);

        bytes memory makerAssetData = tokenAddressToAssetData(makerToken);
        bytes memory takerAssetData = tokenAddressToAssetData(takerToken);

        for (uint256 i = 0; i < numOrders; i++) {
            // store pointer to order memory
            Order memory order = orders[i];

            order.makerFee = 0;
            order.takerFee = 0;
            order.makerAssetData = makerAssetData;
            order.takerAssetData = takerAssetData;

            uint256 dataOffset = getOrderDataOffset(i);

            /* solium-disable-next-line security/no-inline-assembly */
            assembly {
                mstore(order,              mload(add(add(orderData, 32), dataOffset)))  // makerAddress
                mstore(add(order, 32),     mload(add(add(orderData, 64), dataOffset)))  // takerAddress
                mstore(add(order, 64),     mload(add(add(orderData, 96), dataOffset)))  // feeRecipientAddress
                mstore(add(order, 96),     mload(add(add(orderData, 128), dataOffset))) // senderAddress
                mstore(add(order, 128),    mload(add(add(orderData, 160), dataOffset))) // makerAssetAmount
                mstore(add(order, 160),    mload(add(add(orderData, 192), dataOffset))) // takerAssetAmount
                mstore(add(order, 256),    mload(add(add(orderData, 224), dataOffset))) // expirationTimeSeconds
                mstore(add(order, 288),    mload(add(add(orderData, 256), dataOffset))) // salt
            }
        }

        return orders;
    }

    function tokenAddressToAssetData(
        address tokenAddress
    )
        private
        pure
        returns (bytes memory)
    {
        bytes memory result = new bytes(36);

        // padded version of bytes4(keccak256("ERC20Token(address)"));
        bytes32 selector = 0xf47261b000000000000000000000000000000000000000000000000000000000;

        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            // Store the selector and address in the asset data
            // The first 32 bytes of an array are the length (already set above)
            mstore(add(result, 32), selector)
            mstore(add(result, 36), tokenAddress)
        }

        return result;
    }
}
