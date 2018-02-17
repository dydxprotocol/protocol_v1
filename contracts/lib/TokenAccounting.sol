pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { TokenInteract } from "./TokenInteract.sol";


/**
 * @title TokenAccounting
 * @author dYdX
 *
 * Holds and transfers tokens in vaults denominated by id
 */
 /* solium-disable-next-line */
contract TokenAccounting is
    TokenInteract {
    using SafeMath for uint256;

    // Map from token address to total amount of that token attributed to some account.
    mapping(address => uint256) public totalBalances;

    // -----------------------
    // ------ Modifiers ------
    // -----------------------

    /**
     * This is the modifier used when sending away tokens for any reason. Validates that the vault
     * actually carries enough tokens to make this okay.
     */
    modifier sendsTokensExternally(address token, uint256 amount) {
        // Due to underflow-catching, this also catches assert(totalBalances[token] >= amount)
        totalBalances[token] = totalBalances[token].sub(amount);

        // Presumably do the sending
        _;

        // Final validation
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
