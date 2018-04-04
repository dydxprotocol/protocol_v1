pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellStorage } from "./ShortSellStorage.sol";


/**
 * @title LoanGetters
 * @author dYdX
 *
 * A collection of public constant getter functions that allow users and applications to read the
 * state of any loan hash stored in the dYdX protocol.
 */
contract LoanGetters is ShortSellStorage {
    using SafeMath for uint256;

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    function getUnavailableLoanOfferingAmount(
        bytes32 loanHash
    )
        view
        external
        returns (uint256)
    {
        return ShortSellCommon.getUnavailableLoanOfferingAmountImpl(state, loanHash);
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
}
