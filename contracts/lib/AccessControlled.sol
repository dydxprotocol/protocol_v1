pragma solidity 0.4.19;

import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


/**
 * @title AccessControlled
 * @author Antonio Juliano
 *
 * Allows for functions to be access controled, with timelocked permissions
 */
contract AccessControlled is Ownable {
    using SafeMath for uint;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    uint public accessDelay;
    uint public gracePeriodExpiration;

    mapping(address => bool) public authorized;
    mapping(address => uint256) public pendingAuthorizations;

    // ------------------------
    // -------- Events --------
    // ------------------------

    event AccessGranted(
        address who
    );

    event AccessRevoked(
        address who
    );

    event AccessRequested(
        address who
    );

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function AccessControlled(
        uint _accessDelay,
        uint _gracePeriod
    )
        Ownable()
        public
    {
        accessDelay = _accessDelay;
        gracePeriodExpiration = block.timestamp.add(_gracePeriod);
    }

    // ---------------------------
    // -------- Modifiers --------
    // ---------------------------

    modifier requiresAuthorization() {
        require(authorized[msg.sender]);
        _;
    }

    // -------------------------------------------
    // --- Owner Only State Changing Functions ---
    // -------------------------------------------

    function grantAccess(
        address who
    )
        onlyOwner
        external
    {
        if (block.timestamp < gracePeriodExpiration) {
            AccessGranted(who);
            authorized[who] = true;
        } else {
            AccessRequested(who);
            pendingAuthorizations[who] = block.timestamp.add(accessDelay);
        }
    }

    function confirmAccess(
        address who
    )
        onlyOwner
        external
    {
        require(pendingAuthorizations[who] != 0);
        require(block.timestamp >= pendingAuthorizations[who]);
        authorized[who] = true;
        delete pendingAuthorizations[who];
        AccessGranted(who);
    }

    function revokeAccess(
        address who
    )
        onlyOwner
        external
    {
        authorized[who] = false;
        delete pendingAuthorizations[who];
        AccessRevoked(who);
    }
}
