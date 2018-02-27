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

    // ------------------------
    // ------ Constructor -----
    // ------------------------

    function TokenizedShortCreator(
        address _shortSell
    )
        public
        ShortOwner(_shortSell)
    {
    }

    // -------------------------------
    // ------ Public functions -------
    // -------------------------------

    /**
     * Implementation for ShortOwner functionality. Creates a new TokenizedShort and assigns short
     * ownership to the TokenizedShort.
     *
     * @param  _from     Address of the previous owner of the short
     * @return the address of the owner we are passing ownership to
     */
    function recieveShortOwnership(
        address _from,
        bytes32 /* _shortId */
    )
        onlyShortSell
        nonReentrant
        external
        returns (address owner)
    {

        address tokenAddress = new TokenizedShort(
            SHORT_SELL,
            _from
        );

        assert(tokenAddress != address(this));
        assert(tokenAddress != address(0));

        return tokenAddress;
    }
}
