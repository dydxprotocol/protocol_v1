pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { PositionOwner } from "./PositionOwner.sol";


/**
 * @title ClosePositionDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses close a position
 * owned by the smart contract, allowing more complex logic to control positions.
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
contract ClosePositionDelegator is PositionOwner {

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to let other addresses call closePosition().
     *
     * NOTE: If returning a non-zero uint256, this contract must assume that Margin will either
     * revert the entire transaction or that the specified amount of the position was successfully
     * closed.
     *
     * @param  closer           Address of the caller of the closePosition() function
     * @param  payoutRecipient  Address of the recipient of tokens paid out from closing
     * @param  positionId       Unique ID of the position
     * @param  requestedAmount  Requested principal amount of the position to close
     * @return                  Values corresponding to:
     *                          [address] = This address to accept, a different address to ask that
     *                                      contract.
     *                          [uint256] = The maximum amount that this contract is allowing.
     */
    function closeOnBehalfOf(
        address closer,
        address payoutRecipient,
        bytes32 positionId,
        uint256 requestedAmount
    )
        external
        /* onlyMargin */
        returns (address, uint256);
}
