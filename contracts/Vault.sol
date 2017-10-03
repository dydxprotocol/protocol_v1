pragma solidity 0.4.15;

import './lib/AccessControlled.sol';
import './lib/Lockable.sol';
import './lib/SafeMath.sol';
import './interfaces/ERC20.sol';
import './Proxy.sol';
import './Exchange.sol';

/**
 * @title Vault
 * @author Antonio Juliano
 *
 * Holds and transfers tokens in vaults denominated by id
 */
contract Vault is AccessControlled, Lockable, SafeMath {
    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    uint public constant ACCESS_DELAY = 1 days;
    uint public constant GRACE_PERIOD = 8 hours;

    address public PROXY;

    mapping(bytes32 => mapping(address => uint256)) public balances;
    mapping(address => uint256) public totalBalances;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function Vault(
        address _proxy
    ) AccessControlled(ACCESS_DELAY, GRACE_PERIOD) Lockable() {
        PROXY = _proxy;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    // TODO perhaps add a delay to these changes
    function updateProxy(address _proxy) onlyOwner {
        PROXY = _proxy;
    }

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
        assert(ERC20(token).transfer(to, amount));

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
        assert(ERC20(token).balanceOf(address(this)) >= totalBalances[token]);
    }
}
