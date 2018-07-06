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

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { ERC20 } from "../../../external/Maker/ERC20.sol";
import { MatchingMarketInterface } from "../../../external/Maker/MatchingMarketInterface.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";


/**
 * @title MatchingMarketExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with Maker's MatchingMarket contract (Oasis exchange)
 */
contract MatchingMarketExchangeWrapper is
    HasNoEther,
    HasNoContracts,
    ExchangeWrapper
{
    using SafeMath for uint256;
    using TokenInteract for address;

    // ============ State Variables ============

    address public MATCHING_MARKET;

    // ============ Constructor ============

    constructor(
        address margin,
        address dydxProxy,
        address matchingMarket
    )
        public
        ExchangeWrapper(margin, dydxProxy)
    {
        MATCHING_MARKET = matchingMarket;
    }

    // ============ Margin-Only Functions ============

    function exchange(
        address makerToken,
        address takerToken,
        address /*tradeOriginator*/,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        onlyMargin
        returns (uint256)
    {
        assert(takerToken.balanceOf(address(this)) >= requestedFillAmount);

        uint256 receivedMakerAmount = MatchingMarketInterface(MATCHING_MARKET).sellAllAmount(
            ERC20(takerToken),
            requestedFillAmount,
            ERC20(makerToken),
            0
        );

        requireBelowMaximumPrice(requestedFillAmount, receivedMakerAmount, orderData);

        ensureAllowance(
            makerToken,
            DYDX_PROXY,
            receivedMakerAmount
        );

        return receivedMakerAmount;
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
        uint256 cost = MatchingMarketInterface(MATCHING_MARKET).getBuyAmount(
            ERC20(takerToken),
            ERC20(makerToken),
            desiredMakerToken
        );

        requireBelowMaximumPrice(cost, desiredMakerToken, orderData);

        return cost;
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

        token.approve(spender, MathHelpers.maxUint256());
    }

    function requireBelowMaximumPrice(
        uint256 takerAmount,
        uint256 makerAmount,
        bytes orderData
    )
        private
        pure
    {
        (uint256 maxTakerAmount, uint256 forMakerAmount) = getMaximumPrice(orderData);
        if (maxTakerAmount > 0 || forMakerAmount > 0) {
            require(
                takerAmount.mul(forMakerAmount) <= makerAmount.mul(maxTakerAmount),
                "MatchingMarketExchangeWrapper:#requireBelowMaximumPrice: price is too high"
            );
        }
    }

    // ============ Parsing Functions ============

    function getMaximumPrice(
        bytes orderData
    )
        private
        pure
        returns (uint256, uint256)
    {
        uint256 takerAmount = 0;
        uint256 makerAmount = 0;

        if (orderData.length > 0) {
            require(
                orderData.length == 64,
                "MatchingMarketExchangeWrapper:#getMaximumPrice: orderData is not the right length"
            );

            /* solium-disable-next-line security/no-inline-assembly */
            assembly {
                takerAmount := mload(add(orderData, 32))
                makerAmount := mload(add(orderData, 64))
            }

            // since this is a price ratio, the denominator cannot be zero
            require(
                makerAmount > 0,
                "MatchingMarketExchangeWrapper:#getMaximumPrice: makerAmount cannot be zero"
            );
        }

        return (takerAmount, makerAmount);
    }
}
