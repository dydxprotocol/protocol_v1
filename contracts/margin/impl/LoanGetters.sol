pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { MarginCommon } from "./MarginCommon.sol";
import { MarginStorage } from "./MarginStorage.sol";


/**
 * @title LoanGetters
 * @author dYdX
 *
 * A collection of public constant getter functions that allows reading of the state of any loan
 * offering stored in the dYdX protocol.
 */
contract LoanGetters is MarginStorage {

    // ============ Public Constant Functions ============

    /**
     * Gets the principal amount of a loan offering that is no longer available.
     *
     * @param  loanHash  Unique hash of the loan offering
     * @return           The total unavailable amount of the loan offering, which is equal to the
     *                   filled amount plus the canceled amount.
     */
    function getUnavailableLoanOfferingAmount(
        bytes32 loanHash
    )
        external
        view
        returns (uint256)
    {
        return MarginCommon.getUnavailableLoanOfferingAmountImpl(state, loanHash);
    }

    /**
     * Gets the principal amount of a loan offering that has been filled.
     *
     * @param  loanHash  Unique hash of the loan offering
     * @return           The total filled amount of the loan offering.
     */
    function loanFills(
        bytes32 loanHash
    )
        external
        view
        returns (uint256)
    {
        return state.loanFills[loanHash];
    }

    /**
     * Gets the principal amount of a loan offering that has been canceled.
     *
     * @param  loanHash  Unique hash of the loan offering
     * @return           The total canceled amount of the loan offering.
     */
    function loanCancels(
        bytes32 loanHash
    )
        external
        view
        returns (uint256)
    {
        return state.loanCancels[loanHash];
    }

    /**
     * Gets the number of unique positions that have been opened using this loan.
     *
     * @param  loanHash  Unique hash of the loan offering
     * @return           The total number of new positions that have been opened using this loan.
     */
    function loanNumbers(
        bytes32 loanHash
    )
        external
        view
        returns (uint256)
    {
        return state.loanNumbers[loanHash];
    }

    /**
     * Gets if a loan offering has been approved in an on-chain transaction.
     *
     * @param  loanHash  Unique hash of the loan offering
     * @return           True if the loan offering was approved on-chain.
     */
    function isLoanApproved(
        bytes32 loanHash
    )
        external
        view
        returns (bool)
    {
        return state.approvedLoans[loanHash];
    }
}
