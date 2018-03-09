pragma solidity 0.4.19;

import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { ShortSell } from "../ShortSell.sol";
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
        bytes32 indexed shortId,
        address tokenAddress
    );

    // ------------------------
    // ------ Constructor -----
    // ------------------------

    function ERC20ShortCreator(
        address shortSell
    )
        public
        ShortOwner(shortSell)
    {
    }

    // -------------------------------
    // ------ Public functions -------
    // -------------------------------

    /**
     * Implementation of ShortOwner functionality. Creates a new ERC20Short and assigns short
     * ownership to the ERC20Short. Called by ShortSell when a short is transferred to this
     * contract.
     *
     * @param  from  Address of the previous owner of the short
     * @return Address of the new ERC20Short contract
     */
    function recieveShortOwnership(
        address from,
        bytes32 shortId
    )
        onlyShortSell
        nonReentrant
        external
        returns (address _owner)
    {
        address tokenAddress = new ERC20Short(
            shortId,
            SHORT_SELL,
            from
        );

        ERC20ShortCreated(shortId, tokenAddress);

        return tokenAddress;
    }
}
