pragma solidity 0.4.19;


/**
 * @title AccessControlledBase
 * @author dYdX
 *
 * Base functionality for access control. Requires an implementation to
 * provide a way to grant and optionally revoke access
 */
contract AccessControlledBase {
    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    mapping(address => bool) public authorized;

    // ------------------------
    // -------- Events --------
    // ------------------------

    event AccessGranted(
        address who
    );

    event AccessRevoked(
        address who
    );

    // ---------------------------
    // -------- Modifiers --------
    // ---------------------------

    modifier requiresAuthorization() {
        require(authorized[msg.sender]);
        _;
    }
}
