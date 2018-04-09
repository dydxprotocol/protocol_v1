pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { AccessControlledBase } from "./AccessControlledBase.sol";


/**
 * @title StaticAccessControlled
 * @author dYdX
 *
 * Allows for functions to be access controled
 * Permissions cannot be changed after a short grace period
 */
contract StaticAccessControlled is AccessControlledBase, Ownable {
    using SafeMath for uint256;

    // -----------------------------
    // ------ State Variables ------
    // -----------------------------

    // Timestamp after which no additional access can be granted
    uint256 public GRACE_PERIOD_EXPIRATION;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function StaticAccessControlled(
        uint256 gracePeriod
    )
        Ownable()
        public
    {
        GRACE_PERIOD_EXPIRATION = block.timestamp.add(gracePeriod);
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
        require(block.timestamp < GRACE_PERIOD_EXPIRATION);

        emit AccessGranted(who);
        authorized[who] = true;
    }
}
