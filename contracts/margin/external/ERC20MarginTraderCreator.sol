pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { ERC20MarginTrader } from "./ERC20MarginTrader.sol";
import { TraderOwner } from "../interfaces/TraderOwner.sol";


/**
 * @title ERC20MarginTraderCreator
 * @author dYdX
 *
 * This contract is used to deploy new ERC20MarginTrader contracts. A new ERC20MarginTrader is
 * automatically deployed whenever margin position ownership is transferred to this contract. That
 * position is then transferred to the new ERC20MarginTrader, with the tokens initially being
 * allocated to the address that transferred the position originally to the
 * ERC20ERC20MarginTraderCreator.
 */
 /* solium-disable-next-line */
contract ERC20MarginTraderCreator is
    NoOwner,
    TraderOwner,
    ReentrancyGuard
{
    // ============ Events ============

    event ERC20MarginTraderCreated(
        bytes32 indexed marginId,
        address tokenAddress
    );

    // ============ State Variables ============

    // Addresses of recipients that will fairly verify and redistribute funds from a position close
    address[] public TRUSTED_RECIPIENTS;

    // ============ Constructor ============

    function ERC20MarginTraderCreator(
        address margin,
        address[] trustedRecipients
    )
        public
        TraderOwner(margin)
    {
        for (uint256 i = 0; i < trustedRecipients.length; i++) {
            TRUSTED_RECIPIENTS.push(trustedRecipients[i]);
        }
    }

    // ============ Margin-Only Functions ============

    /**
     * Implementation of TraderOwner functionality. Creates a new ERC20MarginTrader and assigns
     * ownership to the ERC20MarginTrader. Called by Margin when a position is transferred to this
     * contract.
     *
     * @param  from  Address of the previous owner of the margin position
     * @return       Address of the new ERC20MarginTrader contract
     */
    function receiveOwnershipAsTrader(
        address from,
        bytes32 marginId
    )
        onlyMargin
        nonReentrant
        external
        returns (address)
    {
        address tokenAddress = new ERC20MarginTrader(
            marginId,
            MARGIN,
            from,
            TRUSTED_RECIPIENTS
        );

        emit ERC20MarginTraderCreated(marginId, tokenAddress);

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
