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

import { CloseLoanDelegator } from "../margin/interfaces/lender/CloseLoanDelegator.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestCloseLoanDelegator is OnlyMargin, CloseLoanDelegator {

    uint256 public AMOUNT_TO_RETURN;

    constructor(
        address margin,
        uint256 amountToReturn
    )
        public
        OnlyMargin(margin)
    {
        AMOUNT_TO_RETURN = amountToReturn;
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

    function closeLoanOnBehalfOf(
        address,
        address,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (address, uint256)
    {
        return (address(this), AMOUNT_TO_RETURN);
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
