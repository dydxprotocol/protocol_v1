pragma solidity 0.4.19;

import { ERC20 } from "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import { NoOwner } from "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import { Pausable } from "zeppelin-solidity/contracts/lifecycle/Pausable.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { AccessControlled } from "../lib/AccessControlled.sol";


/**
 * @title Proxy
 * @author Antonio Juliano
 *
 * Used to transfer tokens between addresses which have set allowance on this contract
 */
contract Proxy is AccessControlled, NoOwner, Pausable {
    using SafeMath for uint;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    /**
     * Only addresses that are transfer authorized can move funds.
     * Authorized addresses through AccessControlled can add and revoke
     * transfer authorized addresses
     */
    mapping(address => bool) public transferAuthorized;
    mapping(address => uint256) public pendingTransferAuthorizations;

    // ------------------------
    // -------- Events --------
    // ------------------------

    event TransferAuthorization(
        address who
    );

    event PendingTransferAuthorization(
        address who
    );

    event TransferDeauthorization(
        address who
    );

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function Proxy(
        uint _accessDelay,
        uint _gracePeriod
    )
        AccessControlled(_accessDelay, _gracePeriod)
        public
    {}

    // ---------------------------
    // -------- Modifiers --------
    // ---------------------------

    modifier requiresTransferAuthorization() {
        require(transferAuthorized[msg.sender]);
        _;
    }

    // --------------------------------------------------
    // ---- Authorized Only State Changing Functions ----
    // --------------------------------------------------

    function grantTransferAuthorization(
        address who
    )
        requiresAuthorization
        whenNotPaused
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
        requiresAuthorization
        whenNotPaused
        external
    {
        if (transferAuthorized[who]) {
            delete transferAuthorized[who];

            TransferDeauthorization(
                who
            );
        }
    }

    // ---------------------------------------------
    // ---- Owner Only State Changing Functions ----
    // ---------------------------------------------

    function ownerGrantTransferAuthorization(
        address who
    )
        onlyOwner
        external
    {
        if (block.timestamp < gracePeriodExpiration) {
            transferAuthorized[who] = true;

            TransferAuthorization(
                who
            );
        } else {
            pendingTransferAuthorizations[who] = block.timestamp.add(accessDelay);

            PendingTransferAuthorization(
                who
            );
        }
    }

    function ownerConfirmTransferAuthorization(
        address who
    )
        onlyOwner
        external
    {
        require(pendingTransferAuthorizations[who] != 0);
        require(block.timestamp >= pendingTransferAuthorizations[who]);
        transferAuthorized[who] = true;
        delete pendingTransferAuthorizations[who];
        TransferAuthorization(
            who
        );
    }

    function ownerRevokeTransferAuthorization(
        address who
    )
        onlyOwner
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
        uint value
    )
        requiresTransferAuthorization
        whenNotPaused
        external
    {
        require(ERC20(token).transferFrom(from, msg.sender, value));
    }

    function transferTo(
        address token,
        address from,
        address to,
        uint value
    )
        requiresTransferAuthorization
        whenNotPaused
        external
    {
        require(ERC20(token).transferFrom(from, to, value));
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
        returns (uint _allowance)
    {
        return Math.min256(
            ERC20(token).allowance(who, address(this)),
            ERC20(token).balanceOf(who)
        );
    }
}
