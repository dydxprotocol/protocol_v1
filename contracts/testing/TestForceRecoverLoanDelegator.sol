pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ForceRecoverLoanDelegator } from "../margin/interfaces/ForceRecoverLoanDelegator.sol";


contract TestForceRecoverLoanDelegator is ForceRecoverLoanDelegator {

    address public RECOVERER;

    function TestForceRecoverLoanDelegator(
        address margin,
        address recoverer
    )
        public
        ForceRecoverLoanDelegator(margin)
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

    function forceRecoverLoanOnBehalfOf(
        address who,
        bytes32
    )
        onlyMargin
        external
        returns (bool)
    {
        return who == RECOVERER;
    }

    function additionalLoanValueAdded(
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
