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
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { ExchangeReader } from "../interfaces/ExchangeReader.sol";


/**
 * @title AuctionProxy
 * @author dYdX
 *
 * Contract that automatically sets the close amount for bidding in a Dutch Auction
 */
contract AuctionProxy
{
    using TokenInteract for address;
    using SafeMath for uint256;

    // ============ Structs ============

    struct Position {
        address heldToken;
        address owedToken;
        address owner;
        uint256 principal;
        uint256 owedTokenOwed;
    }

    // ============ State Variables ============

    address public DYDX_MARGIN;

    // ============ Constructor ============

    constructor(
        address margin
    )
        public
    {
        DYDX_MARGIN = margin;
    }

    // ============ Public Functions ============

    /**
     * Using the Dutch Auction mechanism, bids on a position that is currently closing.
     * Calculates the maximum close amount for a position, exchange, and order.
     *
     * @param  positionId       Unique ID of the position
     * @param  minCloseAmount   The minimum acceptable close amount
     * @param  dutchAuction     The address of the Dutch Auction contract to use
     * @param  exchangeWrapper  The address of the Exchange Wrapper (and Exchange Reader) to use
     * @param  orderData        The order data to pass to the Exchange Wrapper
     * @return                  The principal amount of the position that was closed
     */
    function closePosition(
        bytes32 positionId,
        uint256 minCloseAmount,
        address dutchAuction,
        address exchangeWrapper,
        bytes   orderData
    )
        external
        returns (uint256)
    {
        Margin margin = Margin(DYDX_MARGIN);

        if (!margin.containsPosition(positionId)) {
            return 0; // if position is closed, return zero instead of throwing
        }

        Position memory position = parsePosition(margin, positionId);
        uint256 maxCloseAmount = getMaxCloseAmount(position, exchangeWrapper, orderData);

        if (maxCloseAmount == 0) {
            return 0; // if order cannot be used, return zero instead of throwing
        }

        if (maxCloseAmount < minCloseAmount) {
            return 0; // if order is already taken, return zero instead of throwing
        }

        margin.closePosition(
            positionId,
            maxCloseAmount,
            dutchAuction,
            exchangeWrapper,
            true, // payoutInHeldToken
            orderData
        );

        // give all tokens to the owner
        uint256 heldTokenAmount = position.heldToken.balanceOf(address(this));
        position.heldToken.transfer(position.owner, heldTokenAmount);

        return maxCloseAmount;
    }

    // ============ Private Functions ============

    function parsePosition (
        Margin margin,
        bytes32 positionId
    )
        private
        view
        returns (Position memory)
    {
        Position memory position;
        position.heldToken = margin.getPositionHeldToken(positionId);
        position.owedToken = margin.getPositionOwedToken(positionId);
        position.owner = margin.getPositionOwner(positionId);
        position.principal = margin.getPositionPrincipal(positionId);
        position.owedTokenOwed = margin.getPositionOwedAmount(positionId);
        return position;
    }

    function getMaxCloseAmount(
        Position memory position,
        address exchangeWrapper,
        bytes orderData
    )
        private
        view
        returns (uint256)
    {
        uint256 makerTokenAmount = ExchangeReader(exchangeWrapper).getMaxMakerAmount(
            position.owedToken,
            position.heldToken,
            orderData
        );

        // get maximum close amount
        uint256 closeAmount = MathHelpers.getPartialAmount(
            position.principal,
            position.owedTokenOwed,
            makerTokenAmount
        );

        return closeAmount;
    }
}
