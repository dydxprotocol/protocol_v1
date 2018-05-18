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

import { MarginCallDelegator } from "../margin/interfaces/lender/MarginCallDelegator.sol";
import { CancelMarginCallDelegator } from "../margin/interfaces/lender/CancelMarginCallDelegator.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestMarginCallDelegator is OnlyMargin, MarginCallDelegator, CancelMarginCallDelegator {

    address public CALLER;
    address public CANCELER;

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
    }

    function receiveLoanOwnership(
        address,
        bytes32
    )
        onlyMargin
        external
        view
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
        return address(this);
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
        return address(this);
    }

    function marginLoanIncreased(
        address,
        bytes32,
        uint256
    )
        onlyMargin
        external
        view
        returns (address)
    {
        revert();
    }
}
