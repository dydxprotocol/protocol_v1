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
    HasNoEther,
    HasNoContracts,
    ReentrancyGuard {
    using SafeMath for uint;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    mapping(address => uint256) public totalBalances;
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

    // -------------------------------------------
    // ---- External State Changing Functions ----
    // -------------------------------------------

    /**
     * Allow any account to withdraw token funds from their personal safety deposit box
     * @param  token  ERC20 token to withdraw
     * @return Number of tokens withdrawn
     */
    function withdraw(
        address token
    )
        external
        nonReentrant
        returns (uint256 _tokensWithdrawn)
    {
        // make sure there are tokens to withdraw
        uint256 numTokens = withdrawableBalances[msg.sender][token];
        require(numTokens > 0);

        // subtract from mappings
        withdrawableBalances[msg.sender][token] = 0;
        totalBalances[token] = totalBalances[token].sub(numTokens); // asserts no underflow

        // everything looks good, lets send
        transfer(token, msg.sender, numTokens); // asserts transfer worked
        return numTokens;
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
        totalBalances[token] = totalBalances[token].add(amount);
        withdrawableBalances[account][token] = withdrawableBalances[account][token].add(amount);
        validateBalance(token);
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
