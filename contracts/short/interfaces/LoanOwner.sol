pragma solidity 0.4.19;


/**
 * @title LoanOwner
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to own shorts on behalf of users in order
 * to unlock more complex logic.
 */
contract LoanOwner {

    // address of the known and trusted ShortSell contract on the blockchain
    address public SHORT_SELL;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function LoanOwner(
        address _shortSell
    )
        public
    {
        SHORT_SELL = _shortSell;
    }

    // ---------------------------
    // -------- Modifiers --------
    // ---------------------------

    modifier onlyShortSell()
    {
        require(msg.sender == SHORT_SELL);
        _;
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
