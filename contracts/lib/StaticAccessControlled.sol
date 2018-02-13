pragma solidity 0.4.19;

import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


/**
 * @title StaticAccessControlled
 * @author dYdX
 *
 * Allows for functions to be access controled
 * Permissions cannot be changed
 */
contract StaticAccessControlled is Ownable {
    using SafeMath for uint;

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    uint public gracePeriodExpiration;

    mapping(address => bool) public authorized;

    // ------------------------
    // -------- Events --------
    // ------------------------

    event AccessGranted(
        address who
    );

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function AccessControlled(
        uint _gracePeriod
    )
        Ownable()
        public
    {
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
        require(block.timestamp < gracePeriodExpiration);

        AccessGranted(who);
        authorized[who] = true;
    }
}
