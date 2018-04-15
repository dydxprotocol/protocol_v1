pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ERC20Long } from "./ERC20Long.sol";
import { ERC20PositionCreator } from "./ERC20PositionCreator.sol";


/**
 * @title ERC20LongCreator
 * @author dYdX
 *
 * This contract is used to deploy new ERC20Long contracts. A new ERC20Long is
 * automatically deployed whenever a position is transferred to this contract. Ownership of that
 * position is then transferred to the new ERC20Long, with the tokens initially being
 * allocated to the address that transferred the position originally to the
 * ERC20LongCreator.
 */
contract ERC20LongCreator is ERC20PositionCreator {
    function ERC20LongCreator(
        address margin,
        address[] trustedRecipients
    )
        public
        ERC20PositionCreator(margin, trustedRecipients)
    {}

    // ============ Internal Functions ============

    function createTokenContract(
        address from,
        bytes32 positionId
    )
        internal
        returns (address)
    {
        return new ERC20Long(
            positionId,
            MARGIN,
            from,
            TRUSTED_RECIPIENTS
        );
    }
}
