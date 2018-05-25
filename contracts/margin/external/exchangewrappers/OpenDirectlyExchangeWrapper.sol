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
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";


/**
 * @title OpenDirectlyExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to open a position by borrowing the owedToken instead of atomically selling
 * it. This requires the trader to put up the entire collateral themselves.
 */
contract OpenDirectlyExchangeWrapper is
    HasNoEther,
    HasNoContracts,
    ExchangeWrapper
{
    using SafeMath for uint256;

    constructor(
        address margin,
        address dydxProxy
    )
        public
        ExchangeWrapper(margin, dydxProxy)
    {
    }

    // ============ Margin-Only Functions ============

    function exchangeSell(
        address /* makerToken */,
        address takerToken,
        address tradeOriginator,
        uint256 requestedFillAmount,
        bytes /* orderData */
    )
        external
        onlyMargin
        returns (uint256)
    {
        assert(TokenInteract.balanceOf(takerToken, address(this)) >= requestedFillAmount);
        assert(requestedFillAmount > 0);

        TokenInteract.transfer(takerToken, tradeOriginator, requestedFillAmount);

        return 0;
    }

    function exchangeBuy(
        address /* makerToken */,
        address /* takerToken */,
        address /* tradeOriginator */,
        uint256 desiredMakerToken,
        bytes /* orderData */
    )
        external
        onlyMargin
        returns (uint256)
    {
        require(
            desiredMakerToken == 0,
            "OpenDirectlyExchangeWrapper#exchangeBuy: DesiredMakerToken must be zero"
        );

        return 0;
    }
}
