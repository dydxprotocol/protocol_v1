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
import { LoanOfferingVerifier } from "../margin/interfaces/LoanOfferingVerifier.sol";


contract TestSmartContractLender is LoanOfferingVerifier {
    using TokenInteract for address;
    bool SHOULD_ALLOW;
    address TO_RETURN;

    constructor(
        bool shouldAllow,
        address toReturn
    ) public {
        SHOULD_ALLOW = shouldAllow;
        TO_RETURN = toReturn;
    }

    function verifyLoanOffering(
        address[9],
        uint256[7],
        uint32[4],
        bytes32,
        bytes
    )
        external
        returns (address)
    {
        require(SHOULD_ALLOW);

        return (TO_RETURN == address(0)) ? address(this) : TO_RETURN;
    }

    function allow(
        address token,
        address spender,
        uint256 amount
    )
        external
        returns (bool)
    {
        token.approve(spender, amount);
        return true;
    }
}
