pragma solidity 0.4.19;

import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { ShortSell } from "../ShortSell.sol";
import { TokenizedShort } from "./TokenizedShort.sol";


/**
 * @title TokenizedShortCreator
 * @author dYdX
 *
 * This contract is used to deploy new TokenizedShort contracts without the user having to deploy
 * the bytecode themselves and just have to send a transaction to a pre-existing contract on the
 * blockchain.
 */
contract TokenizedShortCreator is NoOwner {
    // ------------------------
    // ------ Constants -------
    // ------------------------

    address public SHORT_SELL;

    // ------------------------
    // ------ Constructor -----
    // ------------------------

    function TokenizedShortCreator(
        address _shortSell
    )
        public
    {
        SHORT_SELL = _shortSell;
    }

    // -----------------------------
    // ------ Public functions -----
    // -----------------------------

    function tokenizeShort(
        address _initialTokenHolder,
        bytes32 _shortId,
        string _name,
        string _symbol
    )
        external
        returns (address _tokenAddress)
    {
        address token = new TokenizedShort(
            SHORT_SELL,
            _initialTokenHolder,
            _shortId,
            _name,
            _symbol
        );

        return token;
    }
}
