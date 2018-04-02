pragma solidity 0.4.21;
pragma experimental "v0.5.0";

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

    /**
     * Function a contract must implement in order to allow additional value to be added onto
     * an owned short. ShortSell will call this on the owner of a short
     * during ShortSell#addValueToShort. If true is returned, the implementing contract can assume
     * the additional value was added.
     *
     * @param  from         address initiating the addition of funds to the position
     * @param  shortId      id of the short
     * @param  amountAdded  amount to be added to the position
     * @return              true if the contract consents to additional value being added,
     *                      false otherwise
     */
    function additionalShortValueAdded(
        address from,
        bytes32 shortId,
        uint256 amountAdded
    )
        onlyShortSell
        external
        returns (bool);
}
