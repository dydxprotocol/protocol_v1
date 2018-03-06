pragma solidity 0.4.19;

import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { AccessControlledBase } from "./AccessControlledBase.sol";


/**
 * @title StaticAccessControlled
 * @author dYdX
 *
 * Allows for functions to be access controled
 * Permissions cannot be changed
 */
contract StaticAccessControlled is AccessControlledBase, Ownable {
    using SafeMath for uint256;

    uint256 public gracePeriodExpiration;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function StaticAccessControlled(
        uint256 _gracePeriod
    )
        Ownable()
        public
    {
        gracePeriodExpiration = block.timestamp.add(_gracePeriod);
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
