pragma solidity 0.4.23;
pragma experimental "v0.5.0";


/**
 * @title PositionOwner
 * @author dYdX
 *
 * Interface that smart contracts must implement in order to own position on behalf of other
 * accounts
 *
 * NOTE: Any contract implementing this interface should also use OnlyMargin to control access
 *       to these functions
 */
contract PositionOwner {

    // ============ Public Interface functions ============

    /**
     * Function a contract must implement in order to receive ownership of a position via the
     * transferPosition function or the atomic-assign to the "owner" field when opening a position.
     *
     * @param  from        Address of the previous owner
     * @param  positionId  Unique ID of the position
     * @return             This address to keep ownership.
     *                     Address 0x0 to reject ownership completely.
     *                     A different address to pass-on ownership.
     */
    function receivePositionOwnership(
        address from,
        bytes32 positionId
    )
        external
        /* onlyMargin */
        returns (address);

    /**
     * Function a contract must implement in order to allow additional value to be added onto
     * an owned position. Margin will call this on the owner of a positio during increasePosition().
     *
     * NOTE: If this function doesn't throw/revert, this contract must assume that Margin will
     * either revert the entire transaction or that the position size was successfully increased.
     *
     * @param  trader          Address initiating the addition of funds to the position
     * @param  positionId      Unique ID of the position
     * @param  principalAdded  Amount of principal to be added to the position
     * @return                 This address to accept, a different address to ask that contract
     */
    function marginPositionIncreased(
        address trader,
        bytes32 positionId,
        uint256 principalAdded
    )
        external
        /* onlyMargin */
        returns (address);
}
