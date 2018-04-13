pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { ERC20MarginPosition } from "./ERC20MarginPosition.sol";
import { PositionOwner } from "../interfaces/PositionOwner.sol";


/**
 * @title ERC20MarginPositionCreator
 * @author dYdX
 *
 * This contract is used to deploy new ERC20MarginPosition contracts. A new ERC20MarginPosition is
 * automatically deployed whenever margin position ownership is transferred to this contract. That
 * position is then transferred to the new ERC20MarginPosition, with the tokens initially being
 * allocated to the address that transferred the position originally to the
 * ERC20MarginPositionCreator.
 */
 /* solium-disable-next-line */
contract ERC20MarginPositionCreator is
    NoOwner,
    PositionOwner,
    ReentrancyGuard
{
    // ============ Events ============

    event ERC20MarginPositionCreated(
        bytes32 indexed marginId,
        address tokenAddress
    );

    // ============ State Variables ============

    // Payout recipients that will fairly verify and redistribute funds from closing a position
    address[] public TRUSTED_RECIPIENTS;

    // ============ Constructor ============

    function ERC20MarginPositionCreator(
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
     * Implementation of PositionOwner functionality. Creates a new ERC20MarginPosition and assigns
     * ownership to the ERC20MarginPosition. Called by Margin when a position is transferred to this
     * contract.
     *
     * @param  from  Address of the previous owner of the margin position
     * @return       Address of the new ERC20MarginPosition contract
     */
    function receivePositionOwnership(
        address from,
        bytes32 marginId
    )
        onlyMargin
        nonReentrant
        external
        returns (address)
    {
        address tokenAddress = new ERC20MarginPosition(
            marginId,
            MARGIN,
            from,
            TRUSTED_RECIPIENTS
        );

        emit ERC20MarginPositionCreated(marginId, tokenAddress);

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
