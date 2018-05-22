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
import { MarginState } from "./MarginState.sol";
import { TransferInternal } from "./TransferInternal.sol";


/**
 * @title TransferImpl
 * @author dYdX
 *
 * This library contains the implementation for the transferPosition and transferLoan functions of
 * Margin
 */
library TransferImpl {

    // ============ Public Implementation Functions ============

    function transferLoanImpl(
        MarginState.State storage state,
        bytes32 positionId,
        address newLender
    )
        public
    {
        require(
            MarginCommon.containsPositionImpl(state, positionId),
            "TransferImpl#transferLoanImpl: Position does not exist"
        );

        address originalLender = state.positions[positionId].lender;

        require(
            msg.sender == originalLender,
            "TransferImpl#transferLoanImpl: Only lender can transfer ownership"
        );
        require(
            newLender != originalLender,
            "TransferImpl#transferLoanImpl: Cannot transfer ownership to self"
        );

        // Doesn't change the state of positionId; figures out the final owner of loan.
        // That is, newLender may pass ownership to a different address.
        address finalLender = TransferInternal.grantLoanOwnership(
            positionId,
            originalLender,
            newLender);

        require(
            finalLender != originalLender,
            "TransferImpl#transferLoanImpl: Cannot ultimately transfer ownership to self"
        );

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        state.positions[positionId].lender = finalLender;
    }

    function transferPositionImpl(
        MarginState.State storage state,
        bytes32 positionId,
        address newOwner
    )
        public
    {
        require(
            MarginCommon.containsPositionImpl(state, positionId),
            "TransferImpl#transferPositionImpl: Position does not exist"
        );

        address originalOwner = state.positions[positionId].owner;

        require(
            msg.sender == originalOwner,
            "TransferImpl#transferPositionImpl: Only position owner can transfer ownership"
        );
        require(
            newOwner != originalOwner,
            "TransferImpl#transferPositionImpl: Cannot transfer ownership to self"
        );

        // Doesn't change the state of positionId; figures out the final owner of position.
        // That is, newOwner may pass ownership to a different address.
        address finalOwner = TransferInternal.grantPositionOwnership(
            positionId,
            originalOwner,
            newOwner);

        require(
            finalOwner != originalOwner,
            "TransferImpl#transferPositionImpl: Cannot ultimately transfer ownership to self"
        );

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        state.positions[positionId].owner = finalOwner;
    }
}
