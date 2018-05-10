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

import { ForceRecoverCollateralDelegator } from "../margin/interfaces/ForceRecoverCollateralDelegator.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestForceRecoverCollateralDelegator is OnlyMargin, ForceRecoverCollateralDelegator {

    address public RECOVERER;
    address public COLLATERAL_RECIPIENT;

    constructor(
        address margin,
        address recoverer,
        address collateralRecipient
    )
        public
        OnlyMargin(margin)
    {
        RECOVERER = recoverer;
        COLLATERAL_RECIPIENT = collateralRecipient;
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

    function forceRecoverCollateralOnBehalfOf(
        address who,
        bytes32,
        address collateralRecipient
    )
        onlyMargin
        external
        returns (bool)
    {
        bool recovererOkay = (who == RECOVERER);
        bool recipientOkay = (COLLATERAL_RECIPIENT != address(0))
            && (collateralRecipient == COLLATERAL_RECIPIENT);

        return recovererOkay || recipientOkay;
    }

    function marginLoanIncreased(
        address,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (bool)
    {
        return false;
    }
}
