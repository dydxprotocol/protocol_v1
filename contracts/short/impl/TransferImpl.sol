pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
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
        ShortSellState.State storage state,
        bytes32 shortId,
        address newLender
    )
        public
    {
        require(ShortSellCommon.containsShortImpl(state, shortId));
        address originalLender = state.shorts[shortId].lender;
        require(msg.sender == originalLender);
        require(newLender != originalLender);

        // Doesn't change the state of shortId; figures out the address of the final owner of loan.
        // That is, newLender may pass ownership to a different address.
        address finalLender = TransferInternal.grantLoanOwnership(
            shortId,
            originalLender,
            newLender);

        require(finalLender != originalLender);

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        state.shorts[shortId].lender = finalLender;
    }

    function transferShortImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        address newSeller
    )
        public
    {
        require(ShortSellCommon.containsShortImpl(state, shortId));
        address originalSeller = state.shorts[shortId].seller;
        require(msg.sender == originalSeller);
        require(newSeller != originalSeller);

        // Doesn't change the state of shortId; figures out the address of the final owner of short.
        // That is, newSeller may pass ownership to a different address.
        address finalSeller = TransferInternal.grantShortOwnership(
            shortId,
            originalSeller,
            newSeller);
        require(finalSeller != originalSeller);

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        state.shorts[shortId].seller = finalSeller;
    }
}
