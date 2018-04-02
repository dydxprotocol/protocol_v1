pragma solidity 0.4.21;
pragma experimental "v0.5.0";

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

    /**
     * Function a contract must implement in order to allow additional value to be added onto
     * an owned loan. ShortSell will call this on the owner of a loan during
     * ShortSell#addValueToShort. If true is returned, the implementing contract can assume
     * the additional value was added.
     *
     * @param  from         lender adding additional funds to the position
     * @param  shortId      id of the short
     * @param  amountAdded  amount to be added to the position
     * @return              true if the contract consents to additional value being added,
     *                      false otherwise
     */
    function additionalLoanValueAdded(
        address from,
        bytes32 shortId,
        uint256 amountAdded
    )
        onlyShortSell
        external
        returns (bool);
}
