pragma solidity 0.4.19;


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
        address _shortSell
    )
        public
        OnlyShortSell(_shortSell)
    {
    }

    // ----------------------------------------
    // ------ Public Interface functions ------
    // ----------------------------------------

    /**
     * Function a contract must implement in order to recieve ownership of a loan sell via the
     * transferLoan function or the atomic-assign to the "owner" field in a loan offering.
     *
     * @param  _from     Address of the previous owner
     * @param  _shortId  Id of the short
     * @return true on success, false or throw otherwise
     */
    function recieveLoanOwnership(
        address _from,
        bytes32 _shortId
    )
        onlyShortSell
        external
        returns (address owner);
}
