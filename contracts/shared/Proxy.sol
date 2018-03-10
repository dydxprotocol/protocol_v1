pragma solidity 0.4.19;

import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { Pausable } from "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { OwnedAccessControlled } from "../lib/OwnedAccessControlled.sol";
import { TokenInteract } from "../lib/TokenInteract.sol";


/**
 * @title Proxy
 * @author dYdX
 *
 * Used to transfer tokens between addresses which have set allowance on this contract
 */
contract Proxy is OwnedAccessControlled, NoOwner, Pausable {
    using SafeMath for uint256;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    /**
     * Only addresses that are transfer authorized can move funds.
     * Authorized addresses through AccessControlled can add and revoke
     * transfer authorized addresses
     */
    mapping(address => bool) public transferAuthorized;

    // ------------------------
    // -------- Events --------
    // ------------------------

    event TransferAuthorization(
        address who
    );

    event TransferDeauthorization(
        address who
    );

    // ---------------------------
    // -------- Modifiers --------
    // ---------------------------

    modifier requiresTransferAuthorization() {
        require(transferAuthorized[msg.sender]);
        _;
    }

    modifier requiresAuthorizationOrOwner() {
        require(authorized[msg.sender] || owner == msg.sender);
        _;
    }

    // --------------------------------------------------
    // ---- Authorized Only State Changing Functions ----
    // --------------------------------------------------

    function grantTransferAuthorization(
        address who
    )
        requiresAuthorizationOrOwner
        external
    {
        if (!transferAuthorized[who]) {
            transferAuthorized[who] = true;

            TransferAuthorization(
                who
            );
        }
    }

    function revokeTransferAuthorization(
        address who
    )
        requiresAuthorizationOrOwner
        external
    {
        if (transferAuthorized[who]) {
            delete transferAuthorized[who];

            TransferDeauthorization(
                who
            );
        }
    }

    // -----------------------------------------------------------
    // ---- Transfer Authorized Only State Changing Functions ----
    // -----------------------------------------------------------

    function transfer(
        address token,
        address from,
        uint256 value
    )
        requiresTransferAuthorization
        whenNotPaused
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
        requiresTransferAuthorization
        whenNotPaused
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
