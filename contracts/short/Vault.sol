pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { StaticAccessControlled } from "../lib/StaticAccessControlled.sol";
import { TokenInteract } from "../lib/TokenInteract.sol";
import { Proxy } from "../shared/Proxy.sol";
import { Exchange } from "../shared/Exchange.sol";


/**
 * @title Vault
 * @author dYdX
 *
 * Holds and transfers tokens in vaults denominated by id
 *
 * Vault only supports ERC20 tokens, and will not accept any tokens that require
 * a tokenFallback or equivalent function (See ERC223, ERC777, etc.)
 */
 /* solium-disable-next-line */
contract Vault is
    StaticAccessControlled,
    TokenInteract,
    HasNoEther,
    HasNoContracts,
    ReentrancyGuard {
    using SafeMath for uint256;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    address public PROXY;

    // Map from short id to map from token address to amount of that token attributed to the
    // particular short id.
    mapping(bytes32 => mapping(address => uint256)) public balances;

    // Map from token address to total amount of that token attributed to some account.
    mapping(address => uint256) public totalBalances;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function Vault(
        address _proxy,
        uint256 gracePeriod
    )
        StaticAccessControlled(gracePeriod)
        public
    {
        PROXY = _proxy;
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
    {
        // First send tokens to this contract
        Proxy(PROXY).transfer(token, from, amount);

        // Then increment balances
        balances[id][token] = balances[id][token].add(amount);
        totalBalances[token] = totalBalances[token].add(amount);

        // This should always be true. If not, something is very wrong
        assert(totalBalances[token] >= balances[id][token]);

        validateBalance(token);
    }

    /**
     * Transfers a certain amount of funds to an address.
     *
     * @param  id          The vault from which to send the tokens
     * @param  token       ERC20 token address
     * @param  to          Address to transfer tokens to
     * @param  amount      Number of the token to be sent
     */
    function transferFromVault(
        bytes32 id,
        address token,
        address to,
        uint256 amount
    )
        external
        nonReentrant
        requiresAuthorization
    {
        // Next line also asserts that (balances[id][token] >= amount);
        balances[id][token] = balances[id][token].sub(amount);

        // Next line also asserts that (totalBalances[token] >= amount);
        totalBalances[token] = totalBalances[token].sub(amount);

        // This should always be true. If not, something is very wrong
        assert(totalBalances[token] >= balances[id][token]);

        // Do the sending
        transfer(token, to, amount); // asserts transfer succeeded

        // Final validation
        validateBalance(token);
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
    {
        // Next line also asserts that (balances[fromId][token] >= amount);
        balances[fromId][token] = balances[fromId][token].sub(amount);
        balances[toId][token] = balances[toId][token].add(amount);
    }

    /**
     * Verifies that this contract is in control of at least as many tokens as we are accounting for
     * @param  token  Address of ERC20 token
     */
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
