/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { TokenProxy } from "./TokenProxy.sol";
import { StaticAccessControlled } from "../lib/StaticAccessControlled.sol";
import { TokenInteract } from "../lib/TokenInteract.sol";


/**
 * @title Vault
 * @author dYdX
 *
 * Holds and transfers tokens in vaults denominated by id
 *
 * Vault only supports ERC20 tokens, and will not accept any tokens that require
 * a tokenFallback or equivalent function (See ERC223, ERC777, etc.)
 */
contract Vault is StaticAccessControlled
{
    using SafeMath for uint256;

    // ============ Events ============

    event ExcessTokensWithdrawn(
        address indexed token,
        address indexed to,
        address caller
    );

    // ============ State Variables ============

    // Address of the TokenProxy contract. Used for moving tokens.
    address public TOKEN_PROXY;

    // Map from vault ID to map from token address to amount of that token attributed to the
    // particular vault ID.
    mapping (bytes32 => mapping (address => uint256)) public balances;

    // Map from token address to total amount of that token attributed to some account.
    mapping (address => uint256) public totalBalances;

    // ============ Constructor ============

    constructor(
        address proxy,
        uint256 gracePeriod
    )
        public
        StaticAccessControlled(gracePeriod)
    {
        TOKEN_PROXY = proxy;
    }

    // ============ Owner-Only State-Changing Functions ============

    /**
     * Allows the owner to withdraw any excess tokens sent to the vault by unconventional means,
     * including (but not limited-to) token airdrops. Any tokens moved to the vault by TOKEN_PROXY
     * will be accounted for and will not be withdrawable by this function.
     *
     * @param  token  ERC20 token address
     * @param  to     Address to transfer tokens to
     * @return        Amount of tokens withdrawn
     */
    function withdrawExcessToken(
        address token,
        address to
    )
        external
        onlyOwner
        returns (uint256)
    {
        uint256 actualBalance = TokenInteract.balanceOf(token, address(this));
        uint256 accountedBalance = totalBalances[token];
        uint256 withdrawableBalance = actualBalance.sub(accountedBalance);

        require(
            withdrawableBalance != 0,
            "Vault#withdrawExcessToken: Withdrawable token amount must be non-zero"
        );

        TokenInteract.transfer(token, to, withdrawableBalance);

        emit ExcessTokensWithdrawn(token, to, msg.sender);

        return withdrawableBalance;
    }

    // ============ Authorized-Only State-Changing Functions ============

    /**
     * Transfers tokens from an address (that has approved the proxy) to the vault.
     *
     * @param  id      The vault which will receive the tokens
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
        requiresAuthorization
    {
        // First send tokens to this contract
        TokenProxy(TOKEN_PROXY).transferTokens(
            token,
            from,
            address(this),
            amount
        );

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
     * @param  id      The vault from which to send the tokens
     * @param  token   ERC20 token address
     * @param  to      Address to transfer tokens to
     * @param  amount  Number of the token to be sent
     */
    function transferFromVault(
        bytes32 id,
        address token,
        address to,
        uint256 amount
    )
        external
        requiresAuthorization
    {
        // Next line also asserts that (balances[id][token] >= amount);
        balances[id][token] = balances[id][token].sub(amount);

        // Next line also asserts that (totalBalances[token] >= amount);
        totalBalances[token] = totalBalances[token].sub(amount);

        // This should always be true. If not, something is very wrong
        assert(totalBalances[token] >= balances[id][token]);

        // Do the sending
        TokenInteract.transfer(token, to, amount); // asserts transfer succeeded

        // Final validation
        validateBalance(token);
    }

    // ============ Private Helper-Functions ============

    /**
     * Verifies that this contract is in control of at least as many tokens as accounted for
     *
     * @param  token  Address of ERC20 token
     */
    function validateBalance(
        address token
    )
        private
        view
    {
        // The actual balance could be greater than totalBalances[token] because anyone
        // can send tokens to the contract's address which cannot be accounted for
        assert(TokenInteract.balanceOf(token, address(this)) >= totalBalances[token]);
    }
}
