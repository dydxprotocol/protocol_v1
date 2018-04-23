pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { LoanOwner } from "./LoanOwner.sol";


/**
 * @title LiquidatePositionDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses liquidate a loan
 * owned by the smart contract.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
contract LiquidatePositionDelegator is LoanOwner {

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to let other addresses call liquidate() for the
     * lender position. This allows lenders to use more complex logic to control their lending
     * positions.
     *
     * NOTE: If returning non-zero, this contract must assume that Margin will either revert the
     * entire transaction or that the specified amount of the position was successfully
     * closed. Returning 0 will indicate an error and cause Margin to throw.
     *
     * @param  liquidator       Address of the caller of the close function
     * @param  payoutRecipient  Address of the recipient of tokens paid out from closing
     * @param  positionId       Unique ID of the position
     * @param  requestedAmount  Amount of the loan being closed
     * @return                  The amount the user is allowed to close for the specified loan
     */
    function liquidateOnBehalfOf(
        address liquidator,
        address payoutRecipient,
        bytes32 positionId,
        uint256 requestedAmount
    )
        external
        /* onlyMargin */
        returns (uint256);
}
