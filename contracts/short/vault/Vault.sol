pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { StaticAccessControlled } from "../../lib/StaticAccessControlled.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { TokenAccounting } from "../../lib/TokenAccounting.sol";
import { Proxy } from "../../shared/Proxy.sol";
import { Exchange } from "../../shared/Exchange.sol";
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
    TokenAccounting,
    HasNoEther,
    HasNoContracts,
    ReentrancyGuard {
    using SafeMath for uint256;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    address public PROXY;
    address public SAFETY_DEPOSIT_BOX;

    // Map from short id to map from token address to amount of that token attributed to the
    // particular short id.
    mapping(bytes32 => mapping(address => uint256)) public balances;

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

        // Verify that the tokens were actually recieved and update totalBalances for the token
        recieveTokensExternally(token, amount);

        // Then increment balances
        balances[id][token] = balances[id][token].add(amount);

        // This should always be true. If not, something is very wrong
        assert(totalBalances[token] >= balances[id][token]);
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
    {
        // Next line also requires that (balances[id][token] >= amount);
        balances[id][token] = balances[id][token].sub(amount);

        // Place tokens in safety deposit box and update totalBalances for the token
        sendTokensExternally(token, SAFETY_DEPOSIT_BOX, amount);
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
    {
        // Next line also requires that (balances[id][token] >= amount);
        balances[id][token] = balances[id][token].sub(amount);

        // Send tokens to authorized address and updates totalBalances for the token
        sendTokensExternally(token, msg.sender, amount);
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
        // Next line also requires that (balances[fromId][token] >= amount);
        balances[fromId][token] = balances[fromId][token].sub(amount);
        balances[toId][token] = balances[toId][token].add(amount);
    }
}
