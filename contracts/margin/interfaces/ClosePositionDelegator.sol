pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { PositionOwner } from "./PositionOwner.sol";


/**
 * @title ClosePositionDelegator
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to let other addresses close a position
 * owned by the smart contract.
 */
contract ClosePositionDelegator is PositionOwner {

    // ============ Constructor ============

    function ClosePositionDelegator(
        address margin
    )
        public
        PositionOwner(margin)
    {
    }

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to let other addresses call closePosition() for the
     * position. This allows margin traders to use more complex logic to control their positions.
     * For example, this can be used to tokenize positions and distribute shares as ERC20 tokens.
     * Such a token would be burned for the closer in the amount called here. This interface also
     * allows for regulatory compliance; it could require the block.timestamp to be at least some
     * time, or the amount to be at least some minimum denomination.
     *
     * NOTE: If returning non-zero, this contract must assume that Margin will either revert the
     * entire transaction or that the specified amount of the position was successfully
     * closed. Returning 0 will indicate an error and cause Margin to throw.
     *
     * @param closer           Address of the caller of the close function
     * @param payoutRecipient  Address of the recipient of any quote tokens paid out
     * @param marginId         Unique ID of the position
     * @param requestedAmount  Amount of the position being closed
     * @return                 The amount the user is allowed to close for the specified position
     */
    function closeOnBehalfOf(
        address closer,
        address payoutRecipient,
        bytes32 marginId,
        uint256 requestedAmount
    )
        onlyMargin
        external
        returns (uint256);
}
