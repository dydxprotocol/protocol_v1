pragma solidity 0.4.19;

import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { ShortSell } from "../ShortSell.sol";
import { TokenizedShort } from "./TokenizedShort.sol";
import { ShortOwner } from "../interfaces/ShortOwner.sol";


/**
 * @title TokenizedShortCreator
 * @author dYdX
 *
 * This contract is used to deploy new TokenizedShort contracts without the user having to deploy
 * the bytecode themselves and just have to send a transaction to a pre-existing contract on the
 * blockchain.
 */
 /* solium-disable-next-line */
contract TokenizedShortCreator is
    NoOwner,
    ShortOwner,
    ReentrancyGuard
{
    // -------------------
    // ------ Events -----
    // -------------------

    event TokenizedShortCreated(
        bytes32 indexed shortId,
        address tokenAddress
    );

    // ------------------------
    // ------ Constructor -----
    // ------------------------

    function TokenizedShortCreator(
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
     * Implementation for ShortOwner functionality. Creates a new TokenizedShort and assigns short
     * ownership to the TokenizedShort.
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

        address tokenAddress = new TokenizedShort(
            shortId,
            SHORT_SELL,
            from
        );

        TokenizedShortCreated(shortId, tokenAddress);

        return tokenAddress;
    }
}
