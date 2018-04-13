pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { LoanOwner } from "./LoanOwner.sol";


/**
 * @title LiquidateDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses liquidate a loan
 * owned by the smart contract.
 */
contract LiquidateDelegator is LoanOwner {

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function LiquidateDelegator(
        address margin
    )
        public
        LoanOwner(margin)
    {
    }

    // ----------------------------------------
    // ------ Public Interface functions ------
    // ----------------------------------------

    /**
     * Function a contract must implement in order to let other addresses call liquidate() for the
     * lender position. This allows lenders to use more complex logic to control their lending
     * positions.
     *
     * NOTE: If returning non-zero, this contract must assume that Margin will either revert the
     * entire transaction or that the specified amount of the short position was successfully
     * closed. Returning 0 will indicate an error and cause Margin to throw.
     *
     * @param liquidator       Address of the caller of the close function
     * @param payoutRecipient  Address of the recipient of quote tokens paid out
     * @param shortId          Unique ID of the short
     * @param requestedAmount  Amount of the loan being closed
     * @return                 The amount the user is allowed to close for the specified loan
     */
    function liquidateOnBehalfOf(
        address liquidator,
        address payoutRecipient,
        bytes32 shortId,
        uint256 requestedAmount
    )
        onlyMargin
        external
        returns (uint256);
}
