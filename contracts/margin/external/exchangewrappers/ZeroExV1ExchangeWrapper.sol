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

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { ZeroExExchangeInterfaceV1 } from "../../../external/0x/v1/ZeroExExchangeInterfaceV1.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeReader } from "../../interfaces/ExchangeReader.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";


/**
 * @title ZeroExV1ExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with 0x Version 1
 */
contract ZeroExV1ExchangeWrapper is
    ExchangeWrapper,
    ExchangeReader
{
    using SafeMath for uint256;
    using TokenInteract for address;

    // ============ Structs ============

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

    // ============ State Variables ============

    // msg.senders that will put the correct tradeOriginator in callerData when doing an exchange
    mapping (address => bool) public TRUSTED_MSG_SENDER;

    // address of the ZeroEx V1 Exchange
    address public ZERO_EX_EXCHANGE;

    // address of the ZeroEx V1 TokenTransferProxy
    address public ZERO_EX_TOKEN_PROXY;

    // address of the ZRX token
    address public ZRX;

    // ============ Constructor ============

    constructor(
        address zeroExExchange,
        address zeroExProxy,
        address zrxToken,
        address[] trustedMsgSenders
    )
        public
    {
        ZERO_EX_EXCHANGE = zeroExExchange;
        ZERO_EX_TOKEN_PROXY = zeroExProxy;
        ZRX = zrxToken;

        for (uint256 i = 0; i < trustedMsgSenders.length; i++) {
            TRUSTED_MSG_SENDER[trustedMsgSenders[i]] = true;
        }

        // The ZRX token does not decrement allowance if set to MAX_UINT
        // therefore setting it once to the maximum amount is sufficient
        // NOTE: this is *not* standard behavior for an ERC20, so do not rely on it for other tokens
        ZRX.approve(ZERO_EX_TOKEN_PROXY, MathHelpers.maxUint256());
    }

    // ============ Public Functions ============

    function exchange(
        address tradeOriginator,
        address receiver,
        address makerToken,
        address takerToken,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        returns (uint256)
    {
        Order memory order = parseOrder(orderData);

        require(
            requestedFillAmount <= order.takerTokenAmount,
            "ZeroExV1ExchangeWrapper#exchange: Requested fill amount larger than order size"
        );

        require(
            requestedFillAmount <= takerToken.balanceOf(address(this)),
            "ZeroExV1ExchangeWrapper#exchange: Requested fill amount larger than tokens held"
        );

        transferTakerFee(
            order,
            tradeOriginator,
            requestedFillAmount
        );

        ensureAllowance(
            takerToken,
            ZERO_EX_TOKEN_PROXY,
            requestedFillAmount
        );

        uint256 receivedMakerTokenAmount = doTrade(
            order,
            makerToken,
            takerToken,
            requestedFillAmount
        );

        ensureAllowance(
            makerToken,
            receiver,
            receivedMakerTokenAmount
        );

        return receivedMakerTokenAmount;
    }

    function getExchangeCost(
        address /* makerToken */,
        address /* takerToken */,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        view
        returns (uint256)
    {
        Order memory order = parseOrder(orderData);

        return MathHelpers.getPartialAmountRoundedUp(
            order.takerTokenAmount,
            order.makerTokenAmount,
            desiredMakerToken
        );
    }

    function getMaxMakerAmount(
        address makerToken,
        address takerToken,
        bytes orderData
    )
        external
        view
        returns (uint256)
    {
        address zeroExExchange = ZERO_EX_EXCHANGE;
        Order memory order = parseOrder(orderData);

        // order cannot be taken if expired
        if (block.timestamp >= order.expirationUnixTimestampSec) {
            return 0;
        }

        bytes32 orderHash = getOrderHash(
            zeroExExchange,
            makerToken,
            takerToken,
            order
        );

        uint256 unavailableTakerAmount =
            ZeroExExchangeInterfaceV1(zeroExExchange).getUnavailableTakerTokenAmount(orderHash);
        uint256 takerAmount = order.takerTokenAmount.sub(unavailableTakerAmount);
        uint256 makerAmount = MathHelpers.getPartialAmount(
            takerAmount,
            order.takerTokenAmount,
            order.makerTokenAmount
        );

        return makerAmount;
    }

    // ============ Private Functions ============

    function transferTakerFee(
        Order memory order,
        address tradeOriginator,
        uint256 requestedFillAmount
    )
        private
    {
        if (order.feeRecipient == address(0)) {
            return;
        }

        uint256 takerFee = MathHelpers.getPartialAmount(
            requestedFillAmount,
            order.takerTokenAmount,
            order.takerFee
        );

        if (takerFee == 0) {
            return;
        }

        require(
            TRUSTED_MSG_SENDER[msg.sender],
            "ZeroExV1ExchangeWrapper#transferTakerFee: Only trusted senders can dictate the fee payer"
        );

        ZRX.transferFrom(
            tradeOriginator,
            address(this),
            takerFee
        );
    }

    function doTrade(
        Order memory order,
        address makerToken,
        address takerToken,
        uint256 requestedFillAmount
    )
        private
        returns (uint256)
    {
        uint256 filledTakerTokenAmount = ZeroExExchangeInterfaceV1(ZERO_EX_EXCHANGE).fillOrder(
            [
                order.maker,
                order.taker,
                makerToken,
                takerToken,
                order.feeRecipient
            ],
            [
                order.makerTokenAmount,
                order.takerTokenAmount,
                order.makerFee,
                order.takerFee,
                order.expirationUnixTimestampSec,
                order.salt
            ],
            requestedFillAmount,
            true,
            order.v,
            order.r,
            order.s
        );

        require(
            filledTakerTokenAmount == requestedFillAmount,
            "ZeroExV1ExchangeWrapper#doTrade: Could not fill requested amount"
        );

        uint256 receivedMakerTokenAmount = MathHelpers.getPartialAmount(
            filledTakerTokenAmount,
            order.takerTokenAmount,
            order.makerTokenAmount
        );

        return receivedMakerTokenAmount;
    }

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

    function getOrderHash(
        address exchangeAddress,
        address makerToken,
        address takerToken,
        Order memory order
    )
        private
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                exchangeAddress,
                order.maker,
                order.taker,
                makerToken,
                takerToken,
                order.feeRecipient,
                order.makerTokenAmount,
                order.takerTokenAmount,
                order.makerFee,
                order.takerFee,
                order.expirationUnixTimestampSec,
                order.salt
            )
        );
    }

    /**
     * Accepts a byte array with each variable padded to 32 bytes
     */
    function parseOrder(
        bytes orderData
    )
        private
        pure
        returns (Order memory)
    {
        Order memory order;

        /**
         * Total: 384 bytes
         * mstore stores 32 bytes at a time, so go in increments of 32 bytes
         *
         * NOTE: The first 32 bytes in an array stores the length, so we start reading from 32
         */
        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            mstore(order,           mload(add(orderData, 32)))  // maker
            mstore(add(order, 32),  mload(add(orderData, 64)))  // taker
            mstore(add(order, 64),  mload(add(orderData, 96)))  // feeRecipient
            mstore(add(order, 96),  mload(add(orderData, 128))) // makerTokenAmount
            mstore(add(order, 128), mload(add(orderData, 160))) // takerTokenAmount
            mstore(add(order, 160), mload(add(orderData, 192))) // makerFee
            mstore(add(order, 192), mload(add(orderData, 224))) // takerFee
            mstore(add(order, 224), mload(add(orderData, 256))) // expirationUnixTimestampSec
            mstore(add(order, 256), mload(add(orderData, 288))) // salt
            mstore(add(order, 288), mload(add(orderData, 320))) // v
            mstore(add(order, 320), mload(add(orderData, 352))) // r
            mstore(add(order, 352), mload(add(orderData, 384))) // s
        }

        return order;
    }
}
