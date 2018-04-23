pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { ERC20PositionCreator } from "./ERC20PositionCreator.sol";
import { ERC20Short } from "./ERC20Short.sol";


/**
 * @title ERC20ShortCreator
 * @author dYdX
 *
 * This contract is used to deploy new ERC20Short contracts. A new ERC20Short is
 * automatically deployed whenever a position is transferred to this contract. Ownership of that
 * position is then transferred to the new ERC20Short, with the tokens initially being
 * allocated to the address that transferred the position originally to the
 * ERC20ShortCreator.
 */
contract ERC20ShortCreator is ERC20PositionCreator {
    constructor(
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
        return new ERC20Short(
            positionId,
            DYDX_MARGIN,
            from,
            TRUSTED_RECIPIENTS
        );
    }
}
