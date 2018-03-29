pragma solidity 0.4.19;

import { ForceRecoverLoanDelegator } from "../short/interfaces/ForceRecoverLoanDelegator.sol";


contract TestForceRecoverLoanDelegator is ForceRecoverLoanDelegator {

    address public RECOVERER;

    function TestForceRecoverLoanDelegator(
        address shortSell,
        address recoverer
    )
        public
        ForceRecoverLoanDelegator(shortSell)
    {
        RECOVERER = recoverer;
    }

    function receiveLoanOwnership(
        address,
        bytes32
    )
        onlyShortSell
        external
        returns (address)
    {
        return address(this);
    }

    function forceRecoverLoanOnBehalfOf(
        address who,
        bytes32
    )
        onlyShortSell
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
        onlyShortSell
        external
        returns (bool)
    {
        return false;
    }
}
