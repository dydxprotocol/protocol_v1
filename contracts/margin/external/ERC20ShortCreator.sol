pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { ERC20Short } from "./ERC20Short.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";


/**
 * @title ERC20ShortCreator
 * @author dYdX
 *
 * This contract is used to deploy new ERC20Short contracts. A new ERC20Short is automatically
 * deployed whenever a short is transferred to this contract. That short is then transferred to the
 * new ERC20Short, with the tokens initially being allocated to the address that transferred the
 * short originally to the ERC20ERC20ShortCreator.
 */
 /* solium-disable-next-line */
contract ERC20ShortCreator is
    NoOwner,
    ShortOwner,
    ReentrancyGuard
{
    // -------------------
    // ------ Events -----
    // -------------------

    event ERC20ShortCreated(
        bytes32 indexed marginId,
        address tokenAddress
    );

    // ----------------------------
    // ------ State Variables -----
    // ----------------------------

    // Addresses of recipients that will fairly verify and redistribute funds from closing the short
    address[] public TRUSTED_RECIPIENTS;

    // ------------------------
    // ------ Constructor -----
    // ------------------------

    function ERC20ShortCreator(
        address margin,
        address[] trustedRecipients
    )
        public
        ShortOwner(margin)
    {
        for (uint256 i = 0; i < trustedRecipients.length; i++) {
            TRUSTED_RECIPIENTS.push(trustedRecipients[i]);
        }
    }

    // -----------------------------------
    // ---- Margin Only Functions -----
    // -----------------------------------

    /**
     * Implementation of ShortOwner functionality. Creates a new ERC20Short and assigns short
     * ownership to the ERC20Short. Called by Margin when a short is transferred to this
     * contract.
     *
     * @param  from  Address of the previous owner of the short
     * @return       Address of the new ERC20Short contract
     */
    function receiveShortOwnership(
        address from,
        bytes32 marginId
    )
        onlyMargin
        nonReentrant
        external
        returns (address)
    {
        address tokenAddress = new ERC20Short(
            marginId,
            MARGIN,
            from,
            TRUSTED_RECIPIENTS
        );

        emit ERC20ShortCreated(marginId, tokenAddress);

        return tokenAddress;
    }

    function additionalShortValueAdded(
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
