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
import { Margin } from "../Margin.sol";
import { ZeroExExchangeInterface } from "../../external/0x/ZeroExExchangeInterface.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { ZeroExV1Parser } from "../../lib/ZeroExV1Parser.sol";


/**
 * @title AuctionProxy
 * @author dYdX
 *
 * Contract for allowing anyone to close a Dutch Auction
 */
contract AuctionProxy is
    ZeroExV1Parser
{
    using TokenInteract for address;
    using SafeMath for uint256;

    struct Position {
        address heldToken;
        address owedToken;
        address tokenContract;
        uint256 principal;
        uint256 owedTokenOwed;
        uint256 collateralAmount;
    }

    // ============ State Variables ============

    address public DYDX_MARGIN;
    address public ZERO_EX_V1_EXCHANGE;
    address public ZRX;

    // ============ Constructor ============

    constructor(
        address margin,
        address zeroExExchange,
        address zrx
    )
        public
    {
        DYDX_MARGIN = margin;
        ZERO_EX_V1_EXCHANGE = zeroExExchange;
        ZRX = zrx;
    }

    // ============ Public Functions ============

    function closePosition(
        bytes32 positionId,
        address dutchAuction,
        address exchangeWrapper,
        bytes   orderData
    )
        external
        returns (uint256)
    {
        Margin margin = Margin(DYDX_MARGIN);
        Position memory position = parsePosition(margin, positionId);

        uint256 maxCloseAmount = getMaxCloseAmount(position, orderData);

        /*
        uint256 auctionCost = DutchAuctionCloser(dutchAuction).getAuctionCost(positionId, heldTokenFreed);
        require(
            heldTokenFreed - takerAmount - auctionCost >= 0
        );
        */

        margin.closePosition(
            positionId,
            maxCloseAmount,
            dutchAuction,
            exchangeWrapper,
            true, // payoutInHeldToken
            orderData
        );

        // give all tokens to the token contract
        uint256 heldTokenAmount = position.heldToken.balanceOf(address(this));
        position.heldToken.transfer(position.tokenContract, heldTokenAmount);

        return maxCloseAmount;
    }

    // ============ Private Functions ============

    function parsePosition (
        Margin margin,
        bytes32 positionId
    )
        internal
        view
        returns (Position memory)
    {
        Position memory position;
        position.heldToken = margin.getPositionHeldToken(positionId);
        position.owedToken = margin.getPositionOwedToken(positionId);
        position.tokenContract = margin.getPositionOwner(positionId);
        position.principal = margin.getPositionPrincipal(positionId);
        position.owedTokenOwed = margin.getPositionOwedAmount(positionId);
        position.collateralAmount = margin.getPositionBalance(positionId);
        return position;
    }

    function getMaxCloseAmount(
        Position memory position,
        bytes orderData
    )
        internal
        view
        returns (uint256)
    {
        ZeroExV1Parser.Order memory order = parseOrder(orderData);
        validateOrder(order);

        address exchange = ZERO_EX_V1_EXCHANGE;
        bytes32 orderHash = getOrderHash(
            order,
            exchange,
            position.owedToken,
            position.heldToken
        );

        // get maximum executable amounts
        uint256 takerAmount = order.takerTokenAmount.sub(
            ZeroExExchangeInterface(exchange).getUnavailableTakerTokenAmount(orderHash)
        );
        uint256 makerAmount = MathHelpers.getPartialAmount(
            order.makerTokenAmount,
            order.takerTokenAmount,
            takerAmount
        );

        /*
        // verify maker's maker tokens
        verifyTradableTokens(position.owedToken, order.maker, tokenTransferProxy, makerAmount);

        // verify maker's zrx tokens
        uint256 makerFee = getMakerFee(order, takerAmount);
        verifyTradableTokens(ZRX, order.maker, tokenTransferProxy, makerFee);
        */

        // get maximum close amount
        uint256 closeAmount = MathHelpers.getPartialAmount(
            position.principal,
            position.owedTokenOwed,
            makerAmount
        );

        return closeAmount;
    }

    function validateOrder(
        ZeroExV1Parser.Order memory order
    )
        internal
        view
    {
        require(
            block.timestamp < order.expirationUnixTimestampSec,
            "AuctionProxy#getMaxCloseAmount: order is expired"
        );
        require(
            order.feeRecipient == address(0) || order.takerFee == 0,
            "AuctionProxy#getMaxCloseAmount: order has takerFee"
        );
    }

    /*
    function getMakerFee(
        ZeroExV1Parser.Order memory order,
        uint256 takerAmount
    )
        internal
        pure
        returns (uint256)
    {
        return MathHelpers.getPartialAmount(
            takerAmount,
            order.takerTokenAmount,
            order.makerFee
        );
    }

    function verifyTradableTokens(
        address token,
        address maker,
        address tokenTransferProxy,
        uint256 amount
    )
        internal
        view
    {
        require(
            token.allowance(maker, tokenTransferProxy) >= amount
        );
        require(
            token.balanceOf(maker) >= amount
        );
    }
    */
}
