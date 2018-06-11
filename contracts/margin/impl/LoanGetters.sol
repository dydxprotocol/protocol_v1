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

import { MarginCommon } from "./MarginCommon.sol";
import { MarginStorage } from "./MarginStorage.sol";


/**
 * @title LoanGetters
 * @author dYdX
 *
 * A collection of public constant getter functions that allows reading of the state of any loan
 * offering stored in the dYdX protocol.
 */
contract LoanGetters is MarginStorage {

    // ============ Public Constant Functions ============

    /**
     * Gets the principal amount of a loan offering that is no longer available.
     *
     * @param  loanHash  Unique hash of the loan offering
     * @return           The total unavailable amount of the loan offering, which is equal to the
     *                   filled amount plus the canceled amount.
     */
    function getLoanUnavailableAmount(
        bytes32 loanHash
    )
        external
        view
        returns (uint256)
    {
        return MarginCommon.getUnavailableLoanOfferingAmountImpl(state, loanHash);
    }

    /**
     * Gets the total amount of owed token lent for a loan.
     *
     * @param  loanHash  Unique hash of the loan offering
     * @return           The total filled amount of the loan offering.
     */
    function getLoanFilledAmount(
        bytes32 loanHash
    )
        external
        view
        returns (uint256)
    {
        return state.loanFills[loanHash];
    }

    /**
     * Gets the amount of a loan offering that has been canceled.
     *
     * @param  loanHash  Unique hash of the loan offering
     * @return           The total canceled amount of the loan offering.
     */
    function getLoanCanceledAmount(
        bytes32 loanHash
    )
        external
        view
        returns (uint256)
    {
        return state.loanCancels[loanHash];
    }
}
