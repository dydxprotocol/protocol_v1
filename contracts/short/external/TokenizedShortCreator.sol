pragma solidity 0.4.19;

import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { ShortSell } from "../ShortSell.sol";
import { Proxy } from "../../shared/Proxy.sol";
import { TokenizedShort } from "./TokenizedShort.sol";


contract TokenizedShortCreator is NoOwner {

    // ------------------------
    // ------ Constants -------
    // ------------------------

    address public SHORT_SELL;

    // ------------------------
    // ------ Constructor -----
    // ------------------------

    function TokenizedShortCreator(
        address _shortSell,
        uint _updateDelay,
        uint _updateExpiration
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
        address PROXY = ShortSell(SHORT_SELL).PROXY();
        address REPO = ShortSell(SHORT_SELL).REPO();

        address token = new TokenizedShort(
            SHORT_SELL,
            PROXY,
            REPO,
            _initialTokenHolder,
            _shortId,
            _name,
            _symbol
        );

        Proxy(PROXY).grantTransferAuthorization(token);

        return token;
    }
}
