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

import { OnlyMargin } from "./OnlyMargin.sol";


/**
 * @title LoanOwner
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to own loans on behalf of other accounts.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
contract LoanOwner {

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to receive ownership of a loan sell via the
     * transferLoan function or the atomic-assign to the "owner" field in a loan offering.
     *
     * @param  from        Address of the previous owner
     * @param  positionId  Unique ID of the position
     * @return             This address to keep ownership.
     *                     Address 0x0 to reject ownership completely.
     *                     A different address to pass-on ownership.
     */
    function receiveLoanOwnership(
        address from,
        bytes32 positionId
    )
        external
        /* onlyMargin */
        returns (address);

    /**
     * Function a contract must implement in order to allow additional value to be added onto
     * an owned loan. Margin will call this on the owner of a loan during increasePosition().
     *
     * NOTE: If returning true, this contract must assume that Margin will either revert the
     * entire transaction or that the loan size was successfully increased.
     *
     * @param  from            Lender adding additional funds to the position
     * @param  positionId      Unique ID of the position
     * @param  principalAdded  Principal amount to be added to the position
     * @return                 True if the contract consents to additional value being added,
     *                         false otherwise
     */
    function marginLoanIncreased(
        address from,
        bytes32 positionId,
        uint256 principalAdded
    )
        external
        /* onlyMargin */
        returns (bool);
}
