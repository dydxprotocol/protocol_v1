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
 * @title MarginCallDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses margin-call a loan
 * owned by the smart contract.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
contract MarginCallDelegator is LoanOwner {

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to let other addresses call marginCall().
     *
     * NOTE: If returning true, this contract must assume that Margin will either revert the
     * entire transaction or that the loan was successfully margin-called.
     *
     * @param  who            Address of the caller of the marginCall function
     * @param  positionId     Unique ID of the position
     * @param  depositAmount  Amount of heldToken deposit that will be required to cancel the call
     * @return                True if "who" is allowed to margin-call the position, false otherwise
     */
    function marginCallOnBehalfOf(
        address who,
        bytes32 positionId,
        uint256 depositAmount
    )
        external
        /* onlyMargin */
        returns (bool);

    /**
     * Function a contract must implement in order to let other addresses call cancelMarginCall().
     *
     * NOTE: If returning true, this contract must assume that Margin will either revert the
     * entire transaction or that the loan call was successfully canceled.
     *
     * @param  who         Address of the caller of the cancelMarginCall function
     * @param  positionId  Unique ID of the position
     * @return             True if "who" is allowed to cancel the margin-call, false otherwise
     */
    function cancelMarginCallOnBehalfOf(
        address who,
        bytes32 positionId
    )
        external
        /* onlyMargin */
        returns (bool);
}
