pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { StaticAccessControlled } from "../lib/StaticAccessControlled.sol";
import { TokenInteract } from "../lib/TokenInteract.sol";


/**
 * @title Proxy
 * @author dYdX
 *
 * Used to transfer tokens between addresses which have set allowance on this contract
 */
contract Proxy is StaticAccessControlled, NoOwner {
    using SafeMath for uint256;

    // ---------------------
    // ---- Constructor ----
    // ---------------------

    function Proxy(
        uint256 gracePeriod
    )
        public
        StaticAccessControlled(gracePeriod)
    {
    }

    // -----------------------------------------------------------
    // ---- Authorized-Only State Changing Functions ----
    // -----------------------------------------------------------

    /**
     * Transfers tokens from an address (that has set allowance on the proxy) to another address.
     *
     * @param  token  The address of the ERC20 token
     * @param  from   The address to transfer token from
     * @param  to     The address to transfer tokens to
     * @param  value  The number of tokens to transfer
     */
    function transferTokens(
        address token,
        address from,
        address to,
        uint256 value
    )
        requiresAuthorization
        external
    {
        TokenInteract.transferFrom(
            token,
            from,
            to,
            value
        );
    }

    // -----------------------------------------
    // ------- Public Constant Functions -------
    // -----------------------------------------

    /**
     * Getter function to get the amount of token that the proxy is able to move for a particular
     * address. The minimum of 1) the balance of that address and 2) the allowance given to proxy.
     *
     * @param  who    The owner of the tokens
     * @param  token  The address of the ERC20 token
     * @return The number of tokens able to be moved by the proxy from the address specified
     */
    function available(
        address who,
        address token
    )
        view
        external
        returns (uint256 _allowance)
    {
        return Math.min256(
            TokenInteract.allowance(token, who, address(this)),
            TokenInteract.balanceOf(token, who)
        );
    }
}
