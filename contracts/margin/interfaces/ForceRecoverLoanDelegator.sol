pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { LoanOwner } from "./LoanOwner.sol";


/**
 * @title ForceRecoverLoanDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses forceRecoverLoan()
 * a loan owned by the smart contract.
 */
contract ForceRecoverLoanDelegator is LoanOwner {

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ForceRecoverLoanDelegator(
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
     * Function a contract must implement in order to let other addresses call forceRecoverLoan()
     * for the loan-side of a short position.
     *
     * NOTE: If returning true, this contract must assume that Margin will either revert the
     * entire transaction or that the loan call was successfully canceled
     *
     * @param who            Address of the caller of the cancelLoanCall function
     * @param shortId        Unique ID of the short
     * @return               True if the user is allowed to cancel the short call, false otherwise
     */
    function forceRecoverLoanOnBehalfOf(
        address who,
        bytes32 shortId
    )
        onlyMargin
        external
        returns (bool);
}
