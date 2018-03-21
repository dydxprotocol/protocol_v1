pragma solidity 0.4.19;

import { OnlyShortSell } from "./OnlyShortSell.sol";


/**
 * @title LoanOwner
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to own shorts on behalf of users in order
 * to unlock more complex logic.
 */
contract LoanOwner is OnlyShortSell {

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function LoanOwner(
        address shortSell
    )
        public
        OnlyShortSell(shortSell)
    {
    }

    // ----------------------------------------
    // ------ Public Interface functions ------
    // ----------------------------------------

    /**
     * Function a contract must implement in order to receive ownership of a loan sell via the
     * transferLoan function or the atomic-assign to the "owner" field in a loan offering.
     *
     * @param  from     Address of the previous owner
     * @param  shortId  Id of the short
     * @return          The address to pass loan ownership to. Own address to keep loan ownership,
                        0x0 to reject loan ownership completely.
     */
    function receiveLoanOwnership(
        address from,
        bytes32 shortId
    )
        onlyShortSell
        external
        returns (address);
}
