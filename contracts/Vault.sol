pragma solidity 0.4.15;

import './lib/AccessControlled.sol';
import './lib/Lockable.sol';
import './lib/SafeMath.sol';
import './lib/TokenInteract.sol';
import './lib/DelayedUpdate.sol';
import './Proxy.sol';
import './Exchange.sol';

/**
 * @title Vault
 * @author Antonio Juliano
 *
 * Holds and transfers tokens in vaults denominated by id
 */
contract Vault is AccessControlled, Lockable, SafeMath, DelayedUpdate, TokenInteract {
    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    address public PROXY;

    mapping(bytes32 => mapping(address => uint256)) public balances;
    mapping(address => uint256) public totalBalances;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function Vault(
        address _proxy,
        uint accessDelay,
        uint gracePeriod,
        uint updateDelay,
        uint updateExpiration
    )
        AccessControlled(accessDelay, gracePeriod)
        DelayedUpdate(updateDelay, updateExpiration)
        Lockable()
    {
        PROXY = _proxy;
    }

    // -----------------------------
    // ------ Admin Functions ------
    // -----------------------------

    function updateProxy(
        address _proxy
    )
        onlyOwner
        delayedAddressUpdate("PROXY", _proxy)
        external
    {
        PROXY = _proxy;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    function transfer(
        bytes32 id,
        address token,
        address from,
        uint amount
    ) requiresAuthorization lockable {
        // First send tokens to this contract
        Proxy(PROXY).transfer(token, from, amount);

        // Increment balances
        balances[id][token] = safeAdd(balances[id][token], amount);
        totalBalances[token] = safeAdd(totalBalances[token], amount);

        // Validate new balance
        validateBalance(token);
    }

    function send(
        bytes32 id,
        address token,
        address to,
        uint amount
    ) requiresAuthorization lockable {
        require(balances[id][token] >= amount);

        // First decrement balances
        balances[id][token] = safeSub(balances[id][token], amount);
        totalBalances[token] = safeSub(totalBalances[token], amount);

        // Transfer tokens
        transfer(token, to, amount);

        // Validate new balance
        validateBalance(token);
    }

    function deleteBalances(
        bytes32 shortId,
        address baseToken,
        address underlyingToken
    ) requiresAuthorization lockable {
        // TODO delete the fee tokens?

        require(balances[shortId][baseToken] == 0);
        require(balances[shortId][underlyingToken] == 0);

        // ??? is it worth deleting these if they are 0 ?
        delete balances[shortId][baseToken];
        delete balances[shortId][underlyingToken];
    }

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    function validateBalance(
        address token
    ) internal {
        // The actual balance could be greater than totalBalances[token] because anyone
        // can send tokens to the contract's address which cannot be accounted for
        assert(balanceOf(token, address(this)) >= totalBalances[token]);
    }
}
