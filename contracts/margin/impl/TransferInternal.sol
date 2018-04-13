pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { LoanOwner } from "../interfaces/LoanOwner.sol";
import { PositionOwner } from "../interfaces/PositionOwner.sol";


/**
 * @title TransferInternal
 * @author dYdX
 *
 * This library contains the implementation for transferring ownership pf margin positions and loans
 */
library TransferInternal {

    // ============ Events ============

    /**
     * Ownership of a loan was transferred to a new address
     */
    event LoanTransferred(
        bytes32 indexed marginId,
        address indexed from,
        address indexed to
    );

    /**
     * Ownership of a position was transferred to a new address
     */
    event PositionTransferred(
        bytes32 indexed marginId,
        address indexed from,
        address indexed to
    );

    // ============ Internal Implementation Functions ============

    /**
     * Returns either the address of the new position lender, or the address to which they wish to
     * pass ownership. This function does not set state in Margin.
     *
     * @param  marginId  Unique ID of the margin position
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
        // log event except upon position creation
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
     * Returns either the address of the new position owner, or the address to which they wish to
     * pass ownership. This function does not set state in Margin.
     *
     * @param  marginId  Unique ID of the margin position
     * @param  oldOwner  The previous owner of the margin position
     * @param  newOwner  The intended owner of the margin position
     * @return           The address that the intended owner wishes to assign the position to (may
     *                   be the same as the intended owner). Zero if ownership is rejected.
     */
    function grantPositionOwnership(
        bytes32 marginId,
        address oldOwner,
        address newOwner
    )
        internal
        returns (address)
    {
        // log event except upon position creation
        if (oldOwner != address(0)) {
            emit PositionTransferred(marginId, oldOwner, newOwner);
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
