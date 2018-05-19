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

pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ClosePositionDelegator } from "../margin/interfaces/owner/ClosePositionDelegator.sol";
import { IncreasePositionDelegator } from "../margin/interfaces/owner/IncreasePositionDelegator.sol";
import { PositionOwner } from "../margin/interfaces/owner/PositionOwner.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestPositionOwner is
    OnlyMargin,
    PositionOwner,
    IncreasePositionDelegator,
    ClosePositionDelegator
{
    using SafeMath for uint256;

    address public TO_RETURN;
    bool public TO_RETURN_ON_ADD;
    uint256 public TO_RETURN_ON_CLOSE;

    mapping(bytes32 => mapping(address => bool)) public hasReceived;
    mapping(bytes32 => mapping(address => uint256)) public valueAdded;

    constructor(
        address margin,
        address toReturn,
        bool toReturnOnAdd,
        uint256 toReturnOnCloseOnBehalfOf
    )
        public
        OnlyMargin(margin)
    {
        if (toReturn == address(1)) {
            TO_RETURN = address(this);
        } else {
            TO_RETURN = toReturn;
        }

        TO_RETURN_ON_ADD = toReturnOnAdd;
        TO_RETURN_ON_CLOSE = toReturnOnCloseOnBehalfOf;
    }

    function receivePositionOwnership(
        address from,
        bytes32 positionId
    )
        onlyMargin
        external
        returns (address)
    {
        hasReceived[positionId][from] = true;
        return TO_RETURN;
    }

    function increasePositionOnBehalfOf(
        address trader,
        bytes32 positionId,
        uint256 amount
    )
        onlyMargin
        external
        returns (address)
    {
        valueAdded[positionId][trader] = valueAdded[positionId][trader].add(amount);

        require(TO_RETURN_ON_ADD);

        return address(this);
    }

    function closeOnBehalfOf(
        address,
        address,
        bytes32,
        uint256 closeAmount
    )
        external
        onlyMargin
        returns (address, uint256)
    {
        if (TO_RETURN_ON_CLOSE == 1) {
            return (address(this), closeAmount);
        }

        return (address(this), TO_RETURN_ON_CLOSE);
    }
}
