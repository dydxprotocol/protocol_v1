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


/**
 * @title SafetyDespositBox
 * @author dYdX
 *
 * Holds withdrawable token funds for all users.
 */
 /* solium-disable-next-line */
contract SafetyDepositBox is
    StaticAccessControlled,
    TokenInteract,
    TokenAccounting,
    HasNoEther,
    HasNoContracts,
    ReentrancyGuard {
    using SafeMath for uint;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Map from account address to map from token address to amount of that token attributed to the
    // particular account.
    mapping(address => mapping(address => uint256)) public withdrawableBalances;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function SafetyDepositBox(
        uint gracePeriod
    )
        StaticAccessControlled(gracePeriod)
        public
    {
    }

    // --------------------------------------------------
    // ---- Authorized Only State Changing Functions ----
    // --------------------------------------------------

    /**
     * Mark a certain amount of tokens as belonging to a certain account. Requires authorization to
     * call and ensures that those tokens have actually already been deposited into this account.
     * Does not verify that the source of those tokens and the caller of this function were the same
     * entity, but at least prevents too many tokens from being assigned to all accounts combined.
     * @param  token    ERC20 token
     * @param  account  The account to credit with the token
     * @param  amount   Number of token to mark as belonging to account
     */
    function assignTokensToUser(
        address token,
        address account,
        uint amount
    )
        external
        nonReentrant
        requiresAuthorization
    {
        require(amount > 0);

        // validate that we recieved the tokens
        recieveTokensExternally(token, amount);

        withdrawableBalances[account][token] = withdrawableBalances[account][token].add(amount);
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    /**
     * Allow any account to withdraw all specified tokens
     * @param  tokens  Array of ERC20 tokens to withdraw
     * @param  who     Address of account to withdraw tokens for
     * @return Number of tokens withdrawn for each token address
     */
    function withdrawEach(
        address[] tokens,
        address who
    )
        external
    {
        // not nonReentrant, but withdraw() is nonReentrant
        for (uint256 i = 0; i < tokens.length; i++) {
            withdraw(tokens[i], who);
        }
    }

    /**
     * Allow any account to withdraw all tokens of a certain type
     * @param  token  ERC20 token to withdraw
     * @param  who    Address of account to withdraw tokens for
     * @return Number of tokens withdrawn
     */
    function withdraw(
        address token,
        address who
    )
        public
        nonReentrant
        returns (uint256 _tokensWithdrawn)
    {
        // make sure there are tokens to withdraw
        uint256 numTokens = withdrawableBalances[who][token];
        if (numTokens == 0) {
            return numTokens;
        }

        // subtract from mappings
        delete withdrawableBalances[who][token];

        // everything looks good, lets send
        sendTokensExternally(token, who, numTokens);

        return numTokens;
    }
}
