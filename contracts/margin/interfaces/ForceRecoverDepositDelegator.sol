pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { LoanOwner } from "./LoanOwner.sol";


/**
 * @title ForceRecoverDepositDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses forceRecoverDeposit()
 * a loan owned by the smart contract.
 */
contract ForceRecoverDepositDelegator is LoanOwner {

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ForceRecoverDepositDelegator(
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
     * Function a contract must implement in order to let other addresses call forceRecoverDeposit()
     * for the loan-side of a margin position.
     *
     * NOTE: If returning true, this contract must assume that Margin will either revert the
     * entire transaction or that the loan call was successfully canceled
     *
     * @param who            Address of the caller of the cancelMarginCall function
     * @param marginId       Unique ID of the margin position
     * @return               True if the user is allowed to cancel the margin call, false otherwise
     */
    function forceRecoverDepositOnBehalfOf(
        address who,
        bytes32 marginId
    )
        onlyMargin
        external
        returns (bool);
}
