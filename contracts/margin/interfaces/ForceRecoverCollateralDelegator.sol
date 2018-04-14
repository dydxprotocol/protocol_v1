pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { LoanOwner } from "./LoanOwner.sol";


/**
 * @title ForceRecoverCollateralDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses forceRecoverCollateral()
 * a loan owned by the smart contract.
 */
contract ForceRecoverCollateralDelegator is LoanOwner {

    // ============ Constructor ============

    function ForceRecoverCollateralDelegator(
        address margin
    )
        public
        LoanOwner(margin)
    {
    }

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to let other addresses call forceRecoverCollateral()
     * for the loan-side of a position.
     *
     * NOTE: If returning true, this contract must assume that Margin will either revert the
     * entire transaction or that the loan call was successfully canceled
     *
     * @param  who            Address of the caller of the cancelMarginCall function
     * @param  positionId     Unique ID of the position
     * @return                True if the user is allowed to cancel the margin call, false otherwise
     */
    function forceRecoverCollateralOnBehalfOf(
        address who,
        bytes32 positionId
    )
        onlyMargin
        external
        returns (bool);
}
