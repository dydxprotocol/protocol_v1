pragma solidity 0.4.19;

import { OnlyShortSell } from "./OnlyShortSell.sol";


/**
 * @title ShortOwner
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to own shorts on behalf of users in order
 * to unlock more complex logic.
 */
contract ShortOwner is OnlyShortSell {

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortOwner(
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
     * Function a contract must implement in order to recieve ownership of a short sell via the
     * transferShort function or the atomic-assign to the "owner" field when opening a short.
     *
     * @param  _from     Address of the previous owner
     * @param  _shortId  Id of the short that was reassigned
     * @return true on success, false or throw otherwise
     */
    function recieveShortOwnership(
        address _from,
        bytes32 _shortId
    )
        onlyShortSell
        external
        returns (address owner);
}
