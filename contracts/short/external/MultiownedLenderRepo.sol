pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/ownership/NoOwner.sol';
import '../lib/AccessControlled.sol';

contract MultiownedLenderRepo is AccessControlled, NoOwner {
    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    mapping(bytes32 => address) public lenders;
    mapping(bytes32 => mapping(address => bool)) public authorizedToCallLoan;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortSellRepo(
        uint _accessDelay,
        uint _gracePeriod
    ) AccessControlled(_accessDelay, _gracePeriod) public {}

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    function authorizedToCallLoan(
        bytes32 loanHash,
        address who,
        bool isAuthorized
    ) requiresAuthorization public {
        authorizedToCallLoan[loanHash][who] = isAuthorized;
    }
}
