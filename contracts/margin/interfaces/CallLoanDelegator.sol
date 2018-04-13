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

    // ============ Constructor ============

    function CallLoanDelegator(
        address margin
    )
        public
        LoanOwner(margin)
    {
    }

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to let other addresses call marginCall() for
     * the loan-side of a position.
     *
     * NOTE: If returning true, this contract must assume that Margin will either revert the
     * entire transaction or that the loan was successfully called-in
     *
     * @param who            Address of the caller of the marginCall function
     * @param marginId       Unique ID of the position
     * @param depositAmount  Amount of quoteToken deposit that will be required to cancel the call
     * @return               True if the user is allowed to call-in the position, false otherwise
     */
    function marginCallOnBehalfOf(
        address who,
        bytes32 marginId,
        uint256 depositAmount
    )
        onlyMargin
        external
        returns (bool);

    /**
     * Function a contract must implement in order to let other addresses call cancelMarginCall() for
     * the loan-side of a position.
     *
     * NOTE: If returning true, this contract must assume that Margin will either revert the
     * entire transaction or that the loan call was successfully canceled
     *
     * @param who            Address of the caller of the cancelMarginCall function
     * @param marginId       Unique ID of the position
     * @return               True if the user is allowed to cancel the short call, false otherwise
     */
    function cancelMarginCallOnBehalfOf(
        address who,
        bytes32 marginId
    )
        onlyMargin
        external
        returns (bool);
}
