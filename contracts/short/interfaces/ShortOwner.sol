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
     * Function a contract must implement in order to receive ownership of a short sell via the
     * transferShort function or the atomic-assign to the "owner" field when opening a short.
     *
     * @param  from     Address of the previous owner
     * @param  shortId  Id of the short that was reassigned
     * @return          The address to pass short ownership to. Own address to keep short ownership,
                        0x0 to reject loan ownership completely.
     */
    function receiveShortOwnership(
        address from,
        bytes32 shortId
    )
        onlyShortSell
        external
        returns (address);
}
