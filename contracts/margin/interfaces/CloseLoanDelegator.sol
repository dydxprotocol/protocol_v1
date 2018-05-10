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

import { LoanOwner } from "./LoanOwner.sol";


/**
 * @title CloseLoanDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses close a loan
 * owned by the smart contract.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
contract CloseLoanDelegator is LoanOwner {

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to let other addresses call
     * closeWithoutCounterparty().
     *
     * NOTE: If returning non-zero, this contract must assume that Margin will either revert the
     * entire transaction or that the specified amount of the position was successfully closed.
     *
     * @param  closer           Address of the caller of closeWithoutCounterparty()
     * @param  payoutRecipient  Address of the recipient of tokens paid out from closing
     * @param  positionId       Unique ID of the position
     * @param  requestedAmount  Requested principal amount of the loan to close
     * @return                  The amount the user is allowed to close for the specified loan.
     *                          Must be a positive integer less than requestedAmount to not throw.
     */
    function closeLoanOnBehalfOf(
        address closer,
        address payoutRecipient,
        bytes32 positionId,
        uint256 requestedAmount
    )
        external
        /* onlyMargin */
        returns (uint256);
}
