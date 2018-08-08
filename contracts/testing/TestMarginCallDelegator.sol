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

import { MarginCallDelegator } from "../margin/interfaces/lender/MarginCallDelegator.sol";
import { CancelMarginCallDelegator } from "../margin/interfaces/lender/CancelMarginCallDelegator.sol";
import { LoanOwner } from "../margin/interfaces/lender/LoanOwner.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestMarginCallDelegator is
    OnlyMargin,
    LoanOwner,
    MarginCallDelegator,
    CancelMarginCallDelegator
{

    address public CALLER;
    address public CANCELER;
    address public TO_RETURN;

    constructor(
        address margin,
        address caller,
        address canceler
    )
        public
        OnlyMargin(margin)
    {
        CALLER = caller;
        CANCELER = canceler;
        TO_RETURN = address(this);
    }

    function receiveLoanOwnership(
        address,
        bytes32
    )
        onlyMargin
        external
        returns (address)
    {
        return address(this);
    }

    function marginCallOnBehalfOf(
        address caller,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (address)
    {
        require(caller == CALLER);
        return TO_RETURN;
    }

    function cancelMarginCallOnBehalfOf(
        address canceler,
        bytes32
    )
        onlyMargin
        external
        returns (address)
    {
        require(canceler == CANCELER);
        return TO_RETURN;
    }

    function forceRecoverCollateralOnBehalfOf(
        address,
        bytes32,
        address
    )
        onlyMargin
        external
        view
        returns (address)
    {
        return TO_RETURN;
    }

    function setToReturn(
        address toReturn
    )
        external
    {
        TO_RETURN = toReturn;
    }
}
