pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { TransferInternal } from "./TransferInternal.sol";


/**
 * @title TransferImpl
 * @author dYdX
 *
 * This library contains the implementation for transferring ownership of loans and shorts
 */
library TransferImpl {

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function transferLoanImpl(
        MarginState.State storage state,
        bytes32 marginId,
        address newLender
    )
        public
    {
        require(MarginCommon.containsPositionImpl(state, marginId));
        address originalLender = state.positions[marginId].lender;
        require(msg.sender == originalLender);
        require(newLender != originalLender);

        // Doesn't change the state of marginId; figures out the address of the final owner of loan.
        // That is, newLender may pass ownership to a different address.
        address finalLender = TransferInternal.grantLoanOwnership(
            marginId,
            originalLender,
            newLender);

        require(finalLender != originalLender);

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        state.positions[marginId].lender = finalLender;
    }

    function transferOpenPositionImpl(
        MarginState.State storage state,
        bytes32 marginId,
        address newSeller
    )
        public
    {
        require(MarginCommon.containsPositionImpl(state, marginId));
        address originalSeller = state.positions[marginId].seller;
        require(msg.sender == originalSeller);
        require(newSeller != originalSeller);

        // Doesn't change the state of marginId; figures out the address of the final owner of position.
        // That is, newSeller may pass ownership to a different address.
        address finalSeller = TransferInternal.grantPositionOwnership(
            marginId,
            originalSeller,
            newSeller);
        require(finalSeller != originalSeller);

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        state.positions[marginId].seller = finalSeller;
    }
}
