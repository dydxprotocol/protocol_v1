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
 * @title ForceRecoverCollateralDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses
 * forceRecoverCollateral() a loan owned by the smart contract.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
interface ForceRecoverCollateralDelegator {

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to let other addresses call
     * forceRecoverCollateral().
     *
     * NOTE: If not returning zero address (or not reverting), this contract must assume that Margin
     * will either revert the entire transaction or that the collateral was forcibly recovered.
     *
     * @param  recoverer   Address of the caller of the forceRecoverCollateral() function
     * @param  positionId  Unique ID of the position
     * @param  recipient   Address to send the recovered tokens to
     * @return             This address to accept, a different address to ask that contract
     */
    function forceRecoverCollateralOnBehalfOf(
        address recoverer,
        bytes32 positionId,
        address recipient
    )
        external
        /* onlyMargin */
        returns (address);
}
