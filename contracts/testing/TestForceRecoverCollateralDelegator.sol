pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ForceRecoverCollateralDelegator } from "../margin/interfaces/ForceRecoverCollateralDelegator.sol";


contract TestForceRecoverCollateralDelegator is ForceRecoverCollateralDelegator {

    address public RECOVERER;

    function TestForceRecoverCollateralDelegator(
        address margin,
        address recoverer
    )
        public
        ForceRecoverCollateralDelegator(margin)
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

    function forceRecoverCollateralOnBehalfOf(
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
