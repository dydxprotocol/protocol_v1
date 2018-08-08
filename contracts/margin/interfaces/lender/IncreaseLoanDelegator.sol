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


/**
 * @title IncreaseLoanDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to own loans on behalf of other accounts.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
interface IncreaseLoanDelegator {

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to allow additional value to be added onto
     * an owned loan. Margin will call this on the owner of a loan during increasePosition().
     *
     * NOTE: If not returning zero (or not reverting), this contract must assume that Margin will
     * either revert the entire transaction or that the loan size was successfully increased.
     *
     * @param  payer           Lender adding additional funds to the position
     * @param  positionId      Unique ID of the position
     * @param  principalAdded  Principal amount to be added to the position
     * @param  lentAmount      Amount of owedToken lent by the lender (principal plus interest, or
     *                         zero if increaseWithoutCounterparty() is used).
     * @return                 This address to accept, a different address to ask that contract
     */
    function increaseLoanOnBehalfOf(
        address payer,
        bytes32 positionId,
        uint256 principalAdded,
        uint256 lentAmount
    )
        external
        /* onlyMargin */
        returns (address);
}
