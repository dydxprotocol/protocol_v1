pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { Pausable } from "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
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

    function transfer(
        address token,
        address from,
        uint256 value
    )
        requiresAuthorization
        external
    {
        TokenInteract.transferFrom(
            token,
            from,
            msg.sender,
            value
        );
    }

    function transferTo(
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
