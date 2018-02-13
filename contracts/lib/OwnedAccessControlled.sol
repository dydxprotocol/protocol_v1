pragma solidity 0.4.19;

import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";
import { AccessControlledBase } from "/AccessControlledBase.sol";


/**
 * @title OwnedAccessControlled
 * @author dYdX
 *
 * Allows for functions to be access controled
 * Owner has permission to grant and revoke access
 */
contract OwnedAccessControlled is AccessControlledBase, Ownable {
    // -------------------------------------------
    // --- Owner Only State Changing Functions ---
    // -------------------------------------------

    function grantAccess(
        address who
    )
        onlyOwner
        external
    {
        authorized[who] = true;
        AccessGranted(who);
    }

    function revokeAccess(
        address who
    )
        onlyOwner
        external
    {
        authorized[who] = false;
        AccessRevoked(who);
    }
}
