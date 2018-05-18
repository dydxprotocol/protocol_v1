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

import { ERC20 } from "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import { LoanOfferingVerifier } from "../margin/interfaces/LoanOfferingVerifier.sol";


contract TestSmartContractLender is LoanOfferingVerifier {
    bool SHOULD_ALLOW;

    constructor(
        bool shouldAllow
    ) public {
        SHOULD_ALLOW = shouldAllow;
    }

    function verifyLoanOffering(
        address[9],
        uint256[7],
        uint32[4],
        bytes32
    )
        external
        returns (bool)
    {
        return SHOULD_ALLOW;
    }

    function allow(
        address token,
        address spender,
        uint256 amount
    )
        external
        returns (address)
    {
        return ERC20(token).approve(spender, amount);
    }
}
