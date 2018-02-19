pragma solidity 0.4.19;

import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { ShortSell } from "../ShortSell.sol";
import { Proxy } from "../../shared/Proxy.sol";
import { TokenizedShort } from "./TokenizedShort.sol";
import { ShortSellCommon } from "../impl/TokenizedShort.sol";


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
        ShortSellCommon.Short memory short =
            ShortSellCommon.getShortObject(ShortSell(SHORT_SELL).REPO(), _shortId);
        uint8 _decimals = ERC20(short.underlyingToken).decimals();

        address token = new TokenizedShort(
            SHORT_SELL,
            _initialTokenHolder,
            _shortId,
            _name,
            _symbol
            _decimals
        );

        return token;
    }
}
