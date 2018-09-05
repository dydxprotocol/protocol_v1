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
    ExchangeWrapper
{
    using SafeMath for uint256;
    using TokenInteract for address;

    // ============ Margin-Only Functions ============

    function exchange(
        address tradeOriginator,
        address /* receiver */,
        address /* makerToken */,
        address takerToken,
        uint256 requestedFillAmount,
        bytes /* orderData */
    )
        external
        returns (uint256)
    {
        require(
            requestedFillAmount <= takerToken.balanceOf(address(this)),
            "OpenDirectlyExchangeWrapper#exchange: Requested fill amount larger than tokens held"
        );

        TokenInteract.transfer(takerToken, tradeOriginator, requestedFillAmount);

        return 0;
    }

    // ============ Public Constant Functions ============

    function getExchangeCost(
        address /* makerToken */,
        address /* takerToken */,
        uint256 desiredMakerToken,
        bytes /* orderData */
    )
        external
        view
        returns (uint256)
    {
        require(
            desiredMakerToken == 0,
            "OpenDirectlyExchangeWrapper#getExchangeCost: DesiredMakerToken must be zero"
        );

        return 0;
    }
}
