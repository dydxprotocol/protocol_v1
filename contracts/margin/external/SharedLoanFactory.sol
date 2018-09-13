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

import { SharedLoan } from "./SharedLoan.sol";
import { ReentrancyGuard } from "../../lib/ReentrancyGuard.sol";
import { OnlyMargin } from "../interfaces/OnlyMargin.sol";
import { LoanOwner } from "../interfaces/lender/LoanOwner.sol";


/**
 * @title SharedLoanFactory
 * @author dYdX
 *
 * This contract is used to deploy new SharedLoan contracts. A new SharedLoan is automatically
 * deployed whenever a loan is transferred to this contract. That loan is then transferred to the
 * new SharedLoan, with the initial allocation going to the address that transferred the
 * loan originally to the SharedLoanFactory.
 */
contract SharedLoanFactory is
    ReentrancyGuard,
    OnlyMargin,
    LoanOwner
{
    // ============ Events ============

    event SharedLoanCreated(
        bytes32 positionId,
        address sharedLoanAddress
    );

    // ============ State Variables ============

    // Recipients that will fairly verify and redistribute funds from closing the position
    address[] public TRUSTED_MARGIN_CALLERS;

    // ============ Constructor ============

    constructor(
        address margin,
        address[] trustedMarginCallers
    )
        public
        OnlyMargin(margin)
    {
        for (uint256 i = 0; i < trustedMarginCallers.length; i++) {
            TRUSTED_MARGIN_CALLERS.push(trustedMarginCallers[i]);
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Implementation of LoanOwner functionality. Creates a new SharedLoan and assigns loan
     * ownership to the SharedLoan. Called by Margin when a loan is transferred to this
     * contract.
     *
     * @param  from  Address of the previous owner of the loan
     * @return       Address of the new SharedLoan contract
     */
    function receiveLoanOwnership(
        address from,
        bytes32 positionId
    )
        external
        onlyMargin
        returns (address)
    {
        address sharedLoanAddress = new SharedLoan(
            positionId,
            DYDX_MARGIN,
            from,
            TRUSTED_MARGIN_CALLERS
        );

        emit SharedLoanCreated(positionId, sharedLoanAddress);

        return sharedLoanAddress;
    }
}
