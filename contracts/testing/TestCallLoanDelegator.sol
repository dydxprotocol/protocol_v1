pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { CallLoanDelegator } from "../margin/interfaces/CallLoanDelegator.sol";


contract TestCallLoanDelegator is CallLoanDelegator {

    address public CALLER;
    address public CANCELLER;

    function TestCallLoanDelegator(
        address shortSell,
        address caller,
        address canceller
    )
        public
        CallLoanDelegator(shortSell)
    {
        CALLER = caller;
        CANCELLER = canceller;
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

    function callInLoanOnBehalfOf(
        address who,
        bytes32,
        uint256
    )
        onlyShortSell
        external
        returns (bool)
    {
        return who == CALLER;
    }

    function cancelLoanCallOnBehalfOf(
        address who,
        bytes32
    )
        onlyShortSell
        external
        returns (bool)
    {
        return who == CANCELLER;
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
