pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { LoanOwner } from "./LoanOwner.sol";


/**
 * @title CallLoanDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses call-in a loan
 * owned by the smart contract.
 */
contract CallLoanDelegator is LoanOwner {

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function CallLoanDelegator(
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
     * Function a contract must implement in order to let other addresses call callInLoan() for
     * the loan-side of a short position.
     *
     * NOTE: If returning true, this contract must assume that ShortSell will either revert the
     * entire transaction or that the loan was successfully called-in
     *
     * @param who            Address of the caller of the callInLoan function
     * @param shortId        Id of the short being called
     * @param depositAmount  Amount of quoteToken deposit that will be required to cancel the call
     * @return               true if the user is allowed to call-in the short, false otherwise
     */
    function callInLoanOnBehalfOf(
        address who,
        bytes32 shortId,
        uint256 depositAmount
    )
        onlyShortSell
        external
        returns (bool);

    /**
     * Function a contract must implement in order to let other addresses call cancelLoanCall() for
     * the loan-side of a short position.
     *
     * NOTE: If returning true, this contract must assume that ShortSell will either revert the
     * entire transaction or that the loan call was successfully cancelled
     *
     * @param who            Address of the caller of the cancelLoanCall function
     * @param shortId        Id of the short being call-canceled
     * @return               true if the user is allowed to cancel the short call, false otherwise
     */
    function cancelLoancallInLoanOnBehalfOf(
        address who,
        bytes32 shortId
    )
        onlyShortSell
        external
        returns (bool);
}
