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
     * Function a contract must implement in order to let other addresses call liquidate().
     *
     * NOTE: If returning non-zero, this contract must assume that Margin will either revert the
     * entire transaction or that the specified amount of the position was successfully closed.
     *
     * @param  liquidator       Address of the caller of the liquidatePosition() function
     * @param  payoutRecipient  Address of the recipient of tokens paid out from liquidation
     * @param  positionId       Unique ID of the position
     * @param  requestedAmount  Requested principal amount of the loan to liquidate
     * @return                  The amount the user is allowed to liquidate for the specified loan.
     *                          Must be a positive integer less than requestedAmount to not throw.
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
