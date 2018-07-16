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
import { SimpleMarketInterface } from "../../../external/Maker/SimpleMarketInterface.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";


/**
 * @title SimpleMarketExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with Maker's (Oasis exchange) SimpleMarket or MatchingMarket
 * contracts to trade using a specific order. Since any MatchingMarket is also a SimpleMarket, this
 * ExchangeWrapper can also be used for any MatchingMarket.
 */
contract MatchingMarketExchangeWrapper is
    HasNoEther,
    HasNoContracts,
    ExchangeWrapper
{
    using SafeMath for uint256;
    using TokenInteract for address;

    // ============ State Variables ============

    address public SIMPLE_MARKET;

    // ============ Constructor ============

    constructor(
        address margin,
        address dydxProxy,
        address simpleMarket
    )
        public
        ExchangeWrapper(margin, dydxProxy)
    {
        SIMPLE_MARKET = simpleMarket;
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

        SimpleMarketInterface market = SimpleMarketInterface(SIMPLE_MARKET);
        uint256 orderId = getOrderId(orderData);

        (
            uint256 orderMakerAmount,
            ERC20 orderMakerToken,
            uint256 orderTakerAmount,
            ERC20 orderTakerToken
        ) = market.getOffer(orderId);

        require(
            makerToken == address(orderMakerToken),
            "SimpleMarketExchangeWrapper#exchange: makerToken does not match order makerToken"
        );
        require(
            takerToken == address(orderTakerToken),
            "SimpleMarketExchangeWrapper#exchange: takerToken does not match order takerToken"
        );
        require(
            requestedFillAmount <= orderTakerAmount,
            "SimpleMarketExchangeWrapper#exchange: Order is not large enough"
        );

        uint256 makerAmount = MathHelpers.getPartialAmount(
            requestedFillAmount,
            orderTakerAmount,
            orderMakerAmount
        );

        require(
            market.buy(orderId, makerAmount),
            "SimpleMarketExchangeWrapper#exchange: Failed to buy() using the provided order"
        );

        ensureAllowance(
            makerToken,
            DYDX_PROXY,
            makerAmount
        );

        return makerAmount;
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
        SimpleMarketInterface market = SimpleMarketInterface(SIMPLE_MARKET);
        uint256 orderId = getOrderId(orderData);

        (
            uint256 orderMakerAmount,
            ERC20 orderMakerToken,
            uint256 orderTakerAmount,
            ERC20 orderTakerToken
        ) = market.getOffer(orderId);

        require(
            makerToken == address(orderMakerToken),
            "SimpleMarketExchangeWrapper#getExchangeCost: makerToken does not match order makerToken"
        );
        require(
            takerToken == address(orderTakerToken),
            "SimpleMarketExchangeWrapper#getExchangeCost: takerToken does not match order takerToken"
        );
        require(
            desiredMakerToken <= orderMakerAmount,
            "SimpleMarketExchangeWrapper#getExchangeCost: Order is not large enough"
        );

        uint256 cost = MathHelpers.getPartialAmount(
            desiredMakerToken,
            orderMakerAmount,
            orderTakerAmount
        );

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

    // ============ Parsing Functions ============

    function getOrderId(
        bytes orderData
    )
        private
        pure
        returns (uint256)
    {
        require(
            orderData.length == 32,
            "SimpleMarketExchangeWrapper:#getMaximumPrice: orderData is not the right length"
        );

        uint256 offerId;

        /* solium-disable-next-line security/no-inline-assembly */
        assembly {
            offerId := mload(add(orderData, 32))
        }

        return offerId;
    }
}
