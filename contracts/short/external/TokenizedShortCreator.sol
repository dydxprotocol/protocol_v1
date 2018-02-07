pragma solidity 0.4.19;

import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { DelayedUpdate } from "../../lib/DelayedUpdate.sol";
import { Proxy } from "../../shared/Proxy.sol";
import { TokenizedShort } from "./TokenizedShort.sol";


contract TokenizedShortCreator is Ownable, DelayedUpdate, NoOwner {

    // ------------------------
    // ------ Constants -------
    // ------------------------

    address public SHORT_SELL;

    address public PROXY;

    // ------------------------
    // ------ Constructor -----
    // ------------------------

    function TokenizedShortCreator(
        address _shortSell,
        address _proxy,
        uint _updateDelay,
        uint _updateExpiration
    )
        Ownable()
        DelayedUpdate(_updateDelay, _updateExpiration)
        public
    {
        SHORT_SELL = _shortSell;
        PROXY = _proxy;
    }

    // -----------------------------
    // ------ Public functions -----
    // -----------------------------

    function updateShortSell(address _shortSell)
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("SHORT_SELL", _shortSell)
        external
    {
        SHORT_SELL = _shortSell;
    }

    // If changed, the new proxy will need to grant access to this contract
    function updateProxy(address _proxy)
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("PROXY", _proxy)
        external
    {
        PROXY = _proxy;
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
        address token = new TokenizedShort(
            SHORT_SELL,
            PROXY,
            _initialTokenHolder,
            _shortId,
            _name,
            _symbol
        );

        Proxy(PROXY).grantTransferAuthorization(token);

        return token;
    }
}
