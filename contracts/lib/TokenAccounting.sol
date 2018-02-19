pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { TokenInteract } from "./TokenInteract.sol";


/**
 * @title TokenAccounting
 * @author dYdX
 *
 * Holds and transfers tokens in vaults denominated by id.
 *
 * WARNING: Contains only internal functions that are NOT marked as nonReentrant.
 * External, supposedly "ERC20" contracts may contain malicious code in their functions such as
 * balance() or transfer(). Any functions using token accounting should be nonReentrant.
 */
 /* solium-disable-next-line */
contract TokenAccounting is
    TokenInteract {
    using SafeMath for uint256;

    // Map from token address to total amount of that token attributed to some account.
    mapping(address => uint256) public totalBalances;

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    /**
     * Verifies that it is okay to send an amount of tokens to an external address, then sends them
     * and accounts for the change in tokens
     * @param  token   Address of ERC20 token
     * @param  who     Recieving address of transfer
     * @param  amount  Amount of token recieved
     */
    function sendTokensExternally(
        address token,
        address who,
        uint256 amount
    )
        internal
    {
        // Account for removing these tokens
        assert(totalBalances[token] >= amount);
        totalBalances[token] = totalBalances[token].sub(amount);

        // Do the sending
        transfer(token, who, amount); // asserts transfer succeeded

        // Final validation
        validateBalance(token);
    }

    /**
     * Verifies that tokens were recieved and accounts for the change in tokens
     * @param  token   Address of ERC20 token
     * @param  amount  Amount of token recieved
     */
    function recieveTokensExternally(
        address token,
        uint256 amount
    )
        internal
    {
        totalBalances[token] = totalBalances[token].add(amount);
        validateBalance(token);
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
