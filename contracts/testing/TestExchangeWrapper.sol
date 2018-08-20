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

import { TokenInteract } from "../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../margin/interfaces/ExchangeWrapper.sol";


contract TestExchangeWrapper is ExchangeWrapper
{
    using TokenInteract for address;

    // ============ State Variables ============

    uint256 public valueToReturn = 0;
    uint256 public costToReturn = 0;

    // ============ Setter Functions ============

    function setValueToReturn(
        uint256 newValue
    )
        external
    {
        valueToReturn = newValue;
    }

    function setCostToReturn(
        uint256 newCost
    )
        external
    {
        costToReturn = newCost;
    }

    // ============ Exchange Functions ============

    function exchange(
        address,
        address receiver,
        address makerToken,
        address,
        uint256,
        bytes
    )
        external
        returns (uint256)
    {
        makerToken.approve(receiver, valueToReturn);
        return valueToReturn;
    }

    function getExchangeCost(
        address,
        address,
        uint256,
        bytes
    )
        external
        view
        returns (uint256)
    {
        return costToReturn;
    }
}
