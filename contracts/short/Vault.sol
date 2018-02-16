pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { Pausable } from "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { StaticAccessControlled } from "../lib/StaticAccessControlled.sol";
import { TokenInteract } from "../lib/TokenInteract.sol";
import { Proxy } from "../shared/Proxy.sol";
import { Exchange } from "../shared/Exchange.sol";
import { SafetyDepositBox } from "./SafetyDepositBox.sol";


/**
 * @title Vault
 * @author dYdX
 *
 * Holds and transfers tokens in vaults denominated by id
 */
 /* solium-disable-next-line */
contract Vault is
    StaticAccessControlled,
    TokenInteract,
    HasNoEther,
    HasNoContracts,
    Pausable,
    ReentrancyGuard {
    using SafeMath for uint256;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    address public PROXY;
    address public SAFETY_DEPOSIT_BOX;

    mapping(bytes32 => mapping(address => uint256)) public balances;
    mapping(address => uint256) public totalBalances;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function Vault(
        address _proxy,
        address _safetyDepositBox,
        uint256 gracePeriod
    )
        StaticAccessControlled(gracePeriod)
        public
    {
        PROXY = _proxy;
        SAFETY_DEPOSIT_BOX = _safetyDepositBox;
    }

    // -----------------------
    // ------ Modifiers ------
    // -----------------------

    /**
     * This is the modifier used when sending away tokens for any reason. Validates that the vault
     * actually carries enough tokens to make this okay.
     */
    modifier sendsTokens(bytes32 id, address token, uint256 amount) {
        require(balances[id][token] >= amount);

        // This should always be true. If not, something is very wrong
        assert(totalBalances[token] >= amount);

        // First decrement balances
        balances[id][token] = balances[id][token].sub(amount);
        totalBalances[token] = totalBalances[token].sub(amount);

        // Presumably do the sending
        _;

        // Final validation
        validateBalance(token);
    }

    // --------------------------------------------------
    // ---- Authorized Only State Changing Functions ----
    // --------------------------------------------------

    /**
     * Transfers tokens from an address (that has approved the proxy) to the vault.
     * @param  id      The vault which will recieve the tokens
     * @param  token   ERC20 token address
     * @param  from    Address from which the tokens will be taken
     * @param  amount  Number of the token to be sent
     */
    function transferToVault(
        bytes32 id,
        address token,
        address from,
        uint256 amount
    )
        external
        nonReentrant
        requiresAuthorization
        whenNotPaused
    {
        // First send tokens to this contract
        Proxy(PROXY).transfer(token, from, amount);

        // Then increment balances
        balances[id][token] = balances[id][token].add(amount);
        totalBalances[token] = totalBalances[token].add(amount);

        // This should always be true. If not, something is very wrong
        assert(totalBalances[token] >= balances[id][token]);

        // Validate new balance
        validateBalance(token);
    }

    /**
     * Transfers a certain amount of funds to the safety deposit box on behalf of an address.
     * This effectively marks those funds as withdrawable without sending the tokens directly to any
     * untrusted external address which may have a malicious tokenFallback function.
     * @param  id          The vault from which to send the tokens
     * @param  token       ERC20 token address
     * @param  onBehalfOf  Address which can withdraw the tokens from the SafetyDepositBox
     * @param  amount      Number of the token to be sent
     */
    function transferToSafetyDepositBox(
        bytes32 id,
        address token,
        address onBehalfOf,
        uint256 amount
    )
        external
        nonReentrant
        requiresAuthorization
        whenNotPaused
        sendsTokens(id, token, amount)
    {
        transfer(token, SAFETY_DEPOSIT_BOX, amount);
        SafetyDepositBox(SAFETY_DEPOSIT_BOX).assignTokensToUser(token, onBehalfOf, amount);
    }

    /**
     * Transfers a certain amount of funds directly to the message sender. The message sender should
     * always be a trusted contract, so we expect any tokenFallback function to be non-malicious.
     * @param  id      The vault from which to send the tokens
     * @param  token   ERC20 token address
     * @param  amount  Number of the token to be sent
     */
    function withdrawFromVault(
        bytes32 id,
        address token,
        uint256 amount
    )
        external
        nonReentrant
        requiresAuthorization
        whenNotPaused
        sendsTokens(id, token, amount)
    {
        transfer(token, msg.sender, amount);
    }

    /**
     * Transfers tokens between vault ids
     * @param  fromId the vault where the funds will be withdrawn
     * @param  toId    The vault where the funds will be credited
     * @param  token   ERC20 token address
     * @param  amount  Number of the token to be sent
     */
    function transferBetweenVaults(
        bytes32 fromId,
        bytes32 toId,
        address token,
        uint256 amount
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
        balances[fromId][token] = balances[fromId][token].sub(amount);

        // Then increment the balance of the to vault
        balances[toId][token] = balances[toId][token].add(amount);
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
