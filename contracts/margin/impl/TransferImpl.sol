pragma solidity 0.4.23;
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
        require(MarginCommon.containsPositionImpl(state, positionId));
        address originalLender = state.positions[positionId].lender;
        require(msg.sender == originalLender);
        require(newLender != originalLender);

        // Doesn't change the state of positionId; figures out the final owner of loan.
        // That is, newLender may pass ownership to a different address.
        address finalLender = TransferInternal.grantLoanOwnership(
            positionId,
            originalLender,
            newLender);

        require(finalLender != originalLender);

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
        require(MarginCommon.containsPositionImpl(state, positionId));
        address originalOwner = state.positions[positionId].owner;
        require(msg.sender == originalOwner);
        require(newOwner != originalOwner);

        // Doesn't change the state of positionId; figures out the final owner of position.
        // That is, newOwner may pass ownership to a different address.
        address finalOwner = TransferInternal.grantPositionOwnership(
            positionId,
            originalOwner,
            newOwner);
        require(finalOwner != originalOwner);

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        state.positions[positionId].owner = finalOwner;
    }
}
