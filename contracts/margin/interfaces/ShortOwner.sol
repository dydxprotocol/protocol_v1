pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { OnlyMargin } from "./OnlyMargin.sol";


/**
 * @title ShortOwner
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to own shorts on behalf of users in order
 * to unlock more complex logic.
 */
contract ShortOwner is OnlyMargin {

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortOwner(
        address margin
    )
        public
        OnlyMargin(margin)
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
     * @param  shortId  Unique ID of the short
     * @return          The address to pass short ownership to. Own address to keep short ownership,
                        0x0 to reject loan ownership completely.
     */
    function receiveShortOwnership(
        address from,
        bytes32 shortId
    )
        onlyMargin
        external
        returns (address);

    /**
     * Function a contract must implement in order to allow additional value to be added onto
     * an owned short. Margin will call this on the owner of a short
     * during Margin#addValueToShort. If true is returned, the implementing contract can assume
     * the additional value was added.
     *
     * @param  from         Address initiating the addition of funds to the position
     * @param  shortId      Unique ID of the short
     * @param  amountAdded  Amount to be added to the position
     * @return              True if the contract consents to additional value being added,
     *                      false otherwise
     */
    function additionalShortValueAdded(
        address from,
        bytes32 shortId,
        uint256 amountAdded
    )
        onlyMargin
        external
        returns (bool);
}
