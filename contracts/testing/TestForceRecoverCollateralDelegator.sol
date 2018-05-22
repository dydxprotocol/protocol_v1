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

/* solium-disable-next-line max-len*/
import { ForceRecoverCollateralDelegator } from "../margin/interfaces/lender/ForceRecoverCollateralDelegator.sol";
import { LoanOwner } from "../margin/interfaces/lender/LoanOwner.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestForceRecoverCollateralDelegator is
    OnlyMargin,
    LoanOwner,
    ForceRecoverCollateralDelegator
{

    address public RECOVERER;
    address public COLLATERAL_RECIPIENT;

    constructor(
        address margin,
        address recoverer,
        address recipient
    )
        public
        OnlyMargin(margin)
    {
        RECOVERER = recoverer;
        COLLATERAL_RECIPIENT = recipient;
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
        address recoverer,
        bytes32,
        address recipient
    )
        onlyMargin
        external
        returns (address)
    {
        bool recovererOkay = (recoverer == RECOVERER);
        bool recipientOkay = (COLLATERAL_RECIPIENT != address(0))
            && (recipient == COLLATERAL_RECIPIENT);

        require(recovererOkay || recipientOkay);

        return address(this);
    }
}
