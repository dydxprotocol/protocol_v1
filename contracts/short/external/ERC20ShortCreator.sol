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
 * This contract is used to deploy new ERC20Short contracts without the user having to deploy
 * the bytecode themselves and just have to send a transaction to a pre-existing contract on the
 * blockchain.
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
     * Implementation for ShortOwner functionality. Creates a new ERC20Short and assigns short
     * ownership to the ERC20Short.
     *
     * @param  from  Address of the previous owner of the short
     * @return the address of the owner we are passing ownership to
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
