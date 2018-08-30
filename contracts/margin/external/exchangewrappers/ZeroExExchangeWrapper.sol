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
import { HasNoContracts } from "openzeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { HasNoEther } from "openzeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { ZeroExExchangeInterface } from "../../../external/0x/ZeroExExchangeInterface.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ZeroExV1Parser } from "../../../lib/ZeroExV1Parser.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";


/**
 * @title ZeroExExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with 0x Version 1
 */
contract ZeroExExchangeWrapper is
    ZeroExV1Parser,
    HasNoEther,
    HasNoContracts,
    ExchangeWrapper
{
    using SafeMath for uint256;
    using TokenInteract for address;

    // ============ State Variables ============

    // msg.senders that will put the correct tradeOriginator in callerData when doing an exchange
    mapping (address => bool) public TRUSTED_MSG_SENDER;

    address public ZERO_EX_EXCHANGE;
    address public ZERO_EX_TOKEN_PROXY;
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

        for (uint i = 0; i < trustedMsgSenders.length; i++) {
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
        ZeroExV1Parser.Order memory order = parseOrder(orderData);

        require(
            requestedFillAmount <= order.takerTokenAmount,
            "ZeroExExchangeWrapper#exchange: Requested fill amount larger than order size"
        );

        require(
            requestedFillAmount <= takerToken.balanceOf(address(this)),
            "ZeroExExchangeWrapper#exchange: Requested fill amount larger than tokens held"
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
        ZeroExV1Parser.Order memory order = parseOrder(orderData);

        return MathHelpers.getPartialAmountRoundedUp(
            order.takerTokenAmount,
            order.makerTokenAmount,
            desiredMakerToken
        );
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
            "ZeroExExchangeWrapper#transferTakerFee: Only trusted senders can dictate the fee payer"
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
        uint256 filledTakerTokenAmount = ZeroExExchangeInterface(ZERO_EX_EXCHANGE).fillOrder(
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
            "ZeroExExchangeWrapper#doTrade: Could not fill requested amount"
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
}
