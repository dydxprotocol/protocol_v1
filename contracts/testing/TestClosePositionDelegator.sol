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

import { ClosePositionDelegator } from "../margin/interfaces/owner/ClosePositionDelegator.sol";
import { PositionOwner } from "../margin/interfaces/owner/PositionOwner.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestClosePositionDelegator is
    OnlyMargin,
    PositionOwner,
    ClosePositionDelegator
{

    address public CLOSER;
    bool public IS_DEGENERATE; // if true, returns more than requestedAmount;

    constructor(
        address margin,
        address closer,
        bool isDegenerate
    )
        public
        OnlyMargin(margin)
    {
        CLOSER = closer;
        IS_DEGENERATE = isDegenerate;
    }

    function receivePositionOwnership(
        address,
        bytes32
    )
        onlyMargin
        external
        returns (address)
    {
        return address(this);
    }

    function closeOnBehalfOf(
        address closer,
        address,
        bytes32,
        uint256 requestedAmount
    )
        onlyMargin
        external
        returns (address, uint256)
    {
        uint256 amount = (IS_DEGENERATE ? requestedAmount + 1 : requestedAmount);

        require(closer == CLOSER);

        return (address(this), amount);
    }
}
