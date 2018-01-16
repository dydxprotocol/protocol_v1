pragma solidity 0.4.18;

import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { SafeMath } from "./SafeMath.sol";


/**
 * @title AccessControlled
 * @author Antonio Juliano
 *
 * Allows for functions to be access controled, with timelocked permissions
 */
contract AccessControlled is Ownable, SafeMath {
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
        address thisAddress,
        address who,
        uint timestamp
    );

    event AccessRevoked(
        address thisAddress,
        address who,
        uint timestamp
    );

    event AccessRequested(
        address thisAddress,
        address who,
        uint timestamp
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
        gracePeriodExpiration = add(block.timestamp, _gracePeriod);
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

    event Test(
        uint ts,
        bytes32 id
    );

    function grantAccess(
        address who
    )
        onlyOwner
        public
    {
        if (block.timestamp < gracePeriodExpiration) {
            AccessGranted(address(this), who, block.timestamp);
            authorized[who] = true;
        } else {
            AccessRequested(address(this), who, block.timestamp);
            pendingAuthorizations[who] = add(block.timestamp, accessDelay);
        }
    }

    function confirmAccess(
        address who
    )
        onlyOwner
        public
    {
        require(pendingAuthorizations[who] != 0);
        require(block.timestamp >= pendingAuthorizations[who]);
        authorized[who] = true;
        delete pendingAuthorizations[who];
        AccessGranted(address(this), who, block.timestamp);
    }

    function revokeAccess(
        address who
    )
        onlyOwner
        public
    {
        authorized[who] = false;
        delete pendingAuthorizations[who];
        AccessRevoked(address(this), who, block.timestamp);
    }
}
