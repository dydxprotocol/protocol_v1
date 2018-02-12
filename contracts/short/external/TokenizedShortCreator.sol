pragma solidity 0.4.19;

import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { DelayedUpdate } from "../../lib/DelayedUpdate.sol";
import { ShortSell } from "../ShortSell.sol";
import { Proxy } from "../../shared/Proxy.sol";
import { TokenizedShort } from "./TokenizedShort.sol";


contract TokenizedShortCreator is Ownable, DelayedUpdate, NoOwner {

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
        Ownable()
        DelayedUpdate(_updateDelay, _updateExpiration)
        public
    {
        SHORT_SELL = _shortSell;
    }

    // -----------------------------
    // ------ Public functions -----
    // -----------------------------

    // If changed, the new proxy will need to grant access to this contract
    function updateShortSell(address _shortSell)
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("SHORT_SELL", _shortSell)
        external
    {
        SHORT_SELL = _shortSell;
    }

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
