pragma solidity 0.4.19;

import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ContractHelper } from "../../lib/ContractHelper.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellGetters } from "./ShortSellGetters.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";


/**
 * @title TransferImpl
 * @author dYdX
 *
 * This library contains the implementation for transferring ownership of loans and shorts
 */
library TransferImpl {

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * Ownership of a loan was transfered to a new address
     */
    event LoanTransfered(
        bytes32 indexed id,
        address indexed from,
        address indexed to
    );

    /**
     * Ownership of a short was transfered to a new address
     */
    event ShortTransfered(
        bytes32 indexed id,
        address from,
        address to
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    /**
     * Internal implementation of transferring loan ownership to a new address. Requires recieving
     * contracts to implement the LoanOwner interface.
     *
     * @param  state      State of ShortSell
     * @param  shortId    Unique ID of the short
     * @param  newLender  The address the loan is being transferred to. (May re-assign loan)
     */
    function transferLoanImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        address newLender
    )
        public
    {
        // getShortObject also verifies that the loan exists
        address originalLender = ShortSellCommon.getShortObject(state, shortId).lender;
        require(msg.sender == originalLender);

        address finalLender = ShortSellCommon.getNewLoanOwner(
            shortId,
            originalLender,
            newLender);

        require(finalLender != originalLender);

        LoanTransfered(
            shortId,
            originalLender,
            finalLender
        );

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        state.shorts[shortId].lender = finalLender;
    }

    /**
     * Internal implementatino of transferring short ownership to a new address. Requires recieving
     * contracts to implement the ShortOwner interface.
     *
     * @param  state      State of ShortSell
     * @param  shortId    Unique ID of the short
     * @param  newSeller  The address the short is being transferred to. (May re-assign short)
     */
    function transferShortImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        address newSeller
    )
        public
    {
        // getShortObject also verifies that the loan exists
        address originalSeller = ShortSellCommon.getShortObject(state, shortId).seller;
        require(msg.sender == originalSeller);

        address finalSeller = ShortSellCommon.getNewShortOwner(
            shortId,
            originalSeller,
            newSeller);
        require(finalSeller != originalSeller);

        LoanTransfered(
            shortId,
            originalSeller,
            finalSeller
        );

        // Set state only after resolving the new owner (to reduce the number of storage calls)
        state.shorts[shortId].seller = finalSeller;
    }
}
