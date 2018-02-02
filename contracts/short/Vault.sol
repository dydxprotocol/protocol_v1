pragma solidity 0.4.19;

import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { Pausable } from "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { AccessControlled } from "../lib/AccessControlled.sol";
import { TokenInteract } from "../lib/TokenInteract.sol";
import { DelayedUpdate } from "../lib/DelayedUpdate.sol";
import { Proxy } from "../shared/Proxy.sol";
import { Exchange } from "../shared/Exchange.sol";


/**
 * @title Vault
 * @author Antonio Juliano
 *
 * Holds and transfers tokens in vaults denominated by id
 */
 /* solium-disable-next-line */
contract Vault is
    AccessControlled,
    DelayedUpdate,
    TokenInteract,
    HasNoEther,
    HasNoContracts,
    Pausable,
    ReentrancyGuard {
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
        public
    {
        PROXY = _proxy;
    }

    // -----------------------------
    // ------ Admin Functions ------
    // -----------------------------

    function updateProxy(
        address _proxy
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("PROXY", _proxy)
        external
    {
        PROXY = _proxy;
    }

    // --------------------------------------------------
    // ---- Authorized Only State Changing Functions ----
    // --------------------------------------------------

    function transferToVault(
        bytes32 id,
        address token,
        address from,
        uint amount
    )
        external
        nonReentrant
        requiresAuthorization
        whenNotPaused
    {
        // First send tokens to this contract
        Proxy(PROXY).transfer(token, from, amount);

        // Then increment balances
        balances[id][token] = add(balances[id][token], amount);
        totalBalances[token] = add(totalBalances[token], amount);

        // This should always be true. If not, something is very wrong
        assert(totalBalances[token] >= balances[id][token]);

        // Validate new balance
        validateBalance(token);
    }

    function sendFromVault(
        bytes32 id,
        address token,
        address to,
        uint amount
    )
        external
        nonReentrant
        requiresAuthorization
        whenNotPaused
    {
        require(balances[id][token] >= amount);

        // This should always be true. If not, something is very wrong
        assert(totalBalances[token] >= amount);

        // First decrement balances
        balances[id][token] = sub(balances[id][token], amount);
        totalBalances[token] = sub(totalBalances[token], amount);

        // Then transfer tokens
        transfer(token, to, amount);

        // Validate new balance
        validateBalance(token);
    }

    function transferBetweenVaults(
        bytes32 fromId,
        bytes32 toId,
        address token,
        uint amount
    )
        external
        nonReentrant
        requiresAuthorization
        whenNotPaused
    {
        require(balances[fromId][token] >= amount);

        // This should always be true. If not, something is very wrong
        assert(totalBalances[token] >= amount);

        // First decrement the balance of the from vault
        balances[fromId][token] = sub(balances[fromId][token], amount);

        // Then increment the balance of the to vault
        balances[toId][token] = add(balances[toId][token], amount);
    }

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    function validateBalance(
        address token
    )
        internal
        view
    {
        // The actual balance could be greater than totalBalances[token] because anyone
        // can send tokens to the contract's address which cannot be accounted for
        assert(balanceOf(token, address(this)) >= totalBalances[token]);
    }
}
