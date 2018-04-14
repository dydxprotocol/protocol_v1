pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { ERC20Short } from "./ERC20Short.sol";
import { PositionOwner } from "../interfaces/PositionOwner.sol";


/**
 * @title ERC20ShortCreator
 * @author dYdX
 *
 * This contract is used to deploy new ERC20Short contracts. A new ERC20Short is
 * automatically deployed whenever a position is transferred to this contract. Ownership of that
 * position is then transferred to the new ERC20Short, with the tokens initially being
 * allocated to the address that transferred the position originally to the
 * ERC20ERC20ShortCreator.
 */
 /* solium-disable-next-line */
contract ERC20ShortCreator is
    NoOwner,
    PositionOwner,
    ReentrancyGuard
{
    // ============ Events ============

    event ERC20ShortCreated(
        bytes32 indexed positionId,
        address tokenAddress
    );

    // ============ State Variables ============

    // Recipients that will fairly verify and redistribute funds from closing the position
    address[] public TRUSTED_RECIPIENTS;

    // ============ Constructor ============

    function ERC20ShortCreator(
        address margin,
        address[] trustedRecipients
    )
        public
        PositionOwner(margin)
    {
        for (uint256 i = 0; i < trustedRecipients.length; i++) {
            TRUSTED_RECIPIENTS.push(trustedRecipients[i]);
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Implementation of PositionOwner functionality. Creates a new ERC20Short and assigns
     * ownership to the ERC20Short. Called by Margin when a postion is transferred to this
     * contract.
     *
     * @param  from  Address of the previous owner of the position
     * @return       Address of the new ERC20Short contract
     */
    function receivePositionOwnership(
        address from,
        bytes32 positionId
    )
        onlyMargin
        nonReentrant
        external
        returns (address)
    {
        address tokenAddress = new ERC20Short(
            positionId,
            MARGIN,
            from,
            TRUSTED_RECIPIENTS
        );

        emit ERC20ShortCreated(positionId, tokenAddress);

        return tokenAddress;
    }

    function marginPositionIncreased(
        address,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (bool)
    {
        return false;
    }
}
