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
import { IncreaseLoanDelegator } from "../margin/interfaces/lender/IncreaseLoanDelegator.sol";
import { LoanOwner } from "../margin/interfaces/lender/LoanOwner.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestLoanOwner is
    OnlyMargin,
    LoanOwner,
    IncreaseLoanDelegator
{
    using SafeMath for uint256;

    address public TO_RETURN;
    address public TO_RETURN_ON_ADD;

    mapping(bytes32 => mapping(address => bool)) public hasReceived;
    mapping(bytes32 => mapping(address => uint256)) public valueAdded;

    constructor(
        address margin,
        address toReturn,
        address toReturnOnAdd
    )
        public
        OnlyMargin(margin)
    {
        TO_RETURN = toReturn;
        TO_RETURN_ON_ADD = toReturnOnAdd;
    }

    function receiveLoanOwnership(
        address from,
        bytes32 positionId
    )
        onlyMargin
        external
        returns (address)
    {
        hasReceived[positionId][from] = true;
        return (TO_RETURN == address(1)) ? address(this) : TO_RETURN;
    }

    function increaseLoanOnBehalfOf(
        address payer,
        bytes32 positionId,
        uint256 principalAdded,
        uint256 /* lentAmount */
    )
        onlyMargin
        external
        returns (address)
    {
        valueAdded[positionId][payer] = valueAdded[positionId][payer].add(principalAdded);

        return (TO_RETURN_ON_ADD == address(1)) ? address(this) : TO_RETURN_ON_ADD;
    }

    // ============ External Setter Functions ============

    function setToReturn(
        address newAddress
    )
        external
    {
        TO_RETURN = newAddress;
    }

    function setToReturnOnAdd(
        address newAddress
    )
        external
    {
        TO_RETURN_ON_ADD = newAddress;
    }
}
