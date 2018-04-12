pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ForceRecoverDepositDelegator } from "../margin/interfaces/ForceRecoverDepositDelegator.sol";


contract TestForceRecoverDepositDelegator is ForceRecoverDepositDelegator {

    address public RECOVERER;

    function TestForceRecoverDepositDelegator(
        address margin,
        address recoverer
    )
        public
        ForceRecoverDepositDelegator(margin)
    {
        RECOVERER = recoverer;
    }

    function receiveLoanOwnership(
        address,
        bytes32
    )
        onlyMargin
        external
        returns (address)
    {
        return address(this);
    }

    function forceRecoverDepositOnBehalfOf(
        address who,
        bytes32
    )
        onlyMargin
        external
        returns (bool)
    {
        return who == RECOVERER;
    }

    function loanIncreased(
        address,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (bool)
    {
        return false;
    }
}
