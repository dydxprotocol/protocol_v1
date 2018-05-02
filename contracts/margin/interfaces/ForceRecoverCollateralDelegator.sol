pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { LoanOwner } from "./LoanOwner.sol";


/**
 * @title ForceRecoverCollateralDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses
 * forceRecoverCollateral() a loan owned by the smart contract.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
contract ForceRecoverCollateralDelegator is LoanOwner {

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to let other addresses call
     * forceRecoverCollateral().
     *
     * NOTE: If returning true, this contract must assume that Margin will either revert the
     * entire transaction or that the loan call was successfully canceled.
     *
     * @param  who                  Address of the caller of the forceRecoverCollateral() function
     * @param  positionId           Unique ID of the position
     * @param  collateralRecipient  Address to send the recovered tokens to
     * @return                      This address to accept, a different address to ask that contract
     */
    function forceRecoverCollateralOnBehalfOf(
        address who,
        bytes32 positionId,
        address collateralRecipient
    )
        external
        /* onlyMargin */
        returns (address);
}
