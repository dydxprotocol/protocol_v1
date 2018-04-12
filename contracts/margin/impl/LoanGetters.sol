pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { MarginCommon } from "./MarginCommon.sol";
import { MarginStorage } from "./MarginStorage.sol";


/**
 * @title LoanGetters
 * @author dYdX
 *
 * A collection of public constant getter functions that allow users and applications to read the
 * state of any loan hash stored in the dYdX protocol.
 */
contract LoanGetters is MarginStorage {

    // ============ Public Constant Functions ============

    function getUnavailableLoanOfferingAmount(
        bytes32 loanHash
    )
        view
        external
        returns (uint256)
    {
        return MarginCommon.getUnavailableLoanOfferingAmountImpl(state, loanHash);
    }

    function loanFills(
        bytes32 loanHash
    )
        view
        external
        returns (uint256)
    {
        return state.loanFills[loanHash];
    }

    function loanCancels(
        bytes32 loanHash
    )
        view
        external
        returns (uint256)
    {
        return state.loanCancels[loanHash];
    }

    function loanNumbers(
        bytes32 loanHash
    )
        view
        external
        returns (uint256)
    {
        return state.loanNumbers[loanHash];
    }

    function isLoanApproved(
        bytes32 loanHash
    )
        view
        external
        returns (bool)
    {
        return state.approvedLoans[loanHash];
    }
}
