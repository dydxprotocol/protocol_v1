pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { LenderOwner } from "../interfaces/LenderOwner.sol";
import { TraderOwner } from "../interfaces/TraderOwner.sol";


/**
 * @title TransferInternal
 * @author dYdX
 *
 * This library contains the implementation for transferring ownership of loans and margin positions
 */
library TransferInternal {

    // ============ Events ============

    /**
     * Ownership of a loan was transferred to a new address
     */
    event TransferredAsLender(
        bytes32 indexed marginId,
        address indexed from,
        address indexed to
    );

    /**
     * Ownership of a margin position was transferred to a new address
     */
    event TransferredAsTrader(
        bytes32 indexed marginId,
        address indexed from,
        address indexed to
    );

    // ============ Internal Implementation Functions ============

    /**
     * Returns either the address of the new owner, or the address to which they wish to pass
     * ownership of the loan. This function does not actually set the state of the margin position.
     *
     * @param  marginId  Unique ID of the margin position
     * @param  oldOwner  The previous owner of the loan
     * @param  newOwner  The intended owner of the loan
     * @return           The address that the intended owner wishes to assign the loan to (may be
     *                   the same as the intended owner). Zero if ownership is rejected.
     */
    function grantOwnershipAsLender(
        bytes32 marginId,
        address oldOwner,
        address newOwner
    )
        internal
        returns (address)
    {
        // log event except upon position creation
        if (oldOwner != address(0)) {
            emit TransferredAsLender(marginId, oldOwner, newOwner);
        }

        if (AddressUtils.isContract(newOwner)) {
            address nextOwner = LenderOwner(newOwner).receiveOwnershipAsLender(oldOwner, marginId);
            if (nextOwner != newOwner) {
                return grantOwnershipAsLender(marginId, newOwner, nextOwner);
            }
        }

        require (newOwner != address(0));
        return newOwner;
    }

    /**
     * Returns either the address of the new owner, or the address to which they wish to pass
     * ownership of the margin position. This function does not actually set the state of the margin
     * position
     *
     * @param  marginId  Unique ID of the margin position
     * @param  oldOwner  The previous owner of the margin position
     * @param  newOwner  The intended owner of the margin position
     * @return           The address that the intended owner wishes to assign the position to (may
     *                   be the same as the intended owner). Zero if ownership is rejected.
     */
    function grantOwnershipAsTrader(
        bytes32 marginId,
        address oldOwner,
        address newOwner
    )
        internal
        returns (address)
    {
        // log event except upon position creation
        if (oldOwner != address(0)) {
            emit TransferredAsTrader(marginId, oldOwner, newOwner);
        }

        if (AddressUtils.isContract(newOwner)) {
            address nextOwner = TraderOwner(newOwner).receiveOwnershipAsTrader(oldOwner, marginId);
            if (nextOwner != newOwner) {
                return grantOwnershipAsTrader(marginId, newOwner, nextOwner);
            }
        }

        require (newOwner != address(0));
        return newOwner;
    }
}
