pragma solidity 0.4.19;

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
        address shortSell
    )
        public
        LoanOwner(shortSell)
    {
    }

    // ----------------------------------------
    // ------ Public Interface functions ------
    // ----------------------------------------

    /**
     * Function a contract must implement in order to let other addresses call liquidate() for the
     * lender position. This allows lenders to use more complex logic to control their lending positions.
     *
     * NOTE: If returning non-zero, this contract must assume that ShortSell will either revert the
     * entire transaction or that the specified amount of the short position was successfully
     * closed. Returning 0 will indicate an error and cause ShortSell to throw.
     *
     * @param liquidator       Address of the caller of the close function
     * @param shortId          Id of the short being closed
     * @param requestedAmount  Amount of the loan being closed
     * @return                 The amount the user is allowed to close for the specified loan
     */
    function liquidateOnBehalfOf(
        address liquidator,
        bytes32 shortId,
        uint256 requestedAmount
    )
        onlyShortSell
        external
        returns (uint256);
}
