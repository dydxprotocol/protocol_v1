pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { PositionOwner } from "../interfaces/PositionOwner.sol";


/**
 * @title TransferInternal
 * @author dYdX
 *
 * This library contains the implementation for transferring ownership of loans and shorts
 */
library TransferInternal {

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * Ownership of a loan was transferred to a new address
     */
    event LoanTransferred(
        bytes32 indexed marginId,
        address indexed from,
        address indexed to
    );

    /**
     * Ownership of a short was transferred to a new address
     */
    event ShortTransferred(
        bytes32 indexed marginId,
        address indexed from,
        address indexed to
    );

    // ---------------------------------------------
    // ----- Internal Implementation Functions -----
    // ---------------------------------------------

    /**
     * Returns either the address of the new owner, or the address to which they wish to pass
     * ownership of the loan. This function does not actually set the state of short
     *
     * @param  marginId  The Unique ID of the position
     * @param  oldOwner  The previous owner of the loan
     * @param  newOwner  The intended owner of the loan
     * @return           The address that the intended owner wishes to assign the loan to (may be
     *                   the same as the intended owner). Zero if ownership is rejected.
     */
    function grantLoanOwnership(
        bytes32 marginId,
        address oldOwner,
        address newOwner
    )
        internal
        returns (address)
    {
        // log event except upon short creation
        if (oldOwner != address(0)) {
            emit LoanTransferred(marginId, oldOwner, newOwner);
        }

        if (AddressUtils.isContract(newOwner)) {
            address nextOwner = LoanOwner(newOwner).receiveLoanOwnership(oldOwner, marginId);
            if (nextOwner != newOwner) {
                return grantLoanOwnership(marginId, newOwner, nextOwner);
            }
        }

        require (newOwner != address(0));
        return newOwner;
    }

    /**
     * Returns either the address of the new owner, or the address to which they wish to pass
     * ownership of the position. This function does not actually set the state of short
     *
     * @param  marginId  The Unique ID of the position
     * @param  oldOwner  The previous owner of the short
     * @param  newOwner  The intended owner of the short
     * @return           The address that the intended owner wishes to assign the short to (may be
     *                   the same as the intended owner). Zero if ownership is rejected.
     */
    function grantPositionOwnership(
        bytes32 marginId,
        address oldOwner,
        address newOwner
    )
        internal
        returns (address)
    {
        // log event except upon short creation
        if (oldOwner != address(0)) {
            emit ShortTransferred(marginId, oldOwner, newOwner);
        }

        if (AddressUtils.isContract(newOwner)) {
            address nextOwner = PositionOwner(newOwner).receivePositionOwnership(oldOwner, marginId);
            if (nextOwner != newOwner) {
                return grantPositionOwnership(marginId, newOwner, nextOwner);
            }
        }

        require (newOwner != address(0));
        return newOwner;
    }
}
