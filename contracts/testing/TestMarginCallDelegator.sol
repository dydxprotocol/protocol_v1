pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { MarginCallDelegator } from "../margin/interfaces/MarginCallDelegator.sol";


contract TestMarginCallDelegator is MarginCallDelegator {

    address public CALLER;
    address public CANCELLER;

    function TestMarginCallDelegator(
        address margin,
        address caller,
        address canceller
    )
        public
        MarginCallDelegator(margin)
    {
        CALLER = caller;
        CANCELLER = canceller;
    }

    function receiveOwnershipAsLender(
        address,
        bytes32
    )
        onlyMargin
        external
        returns (address)
    {
        return address(this);
    }

    function marginCallOnBehalfOf(
        address who,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (bool)
    {
        return who == CALLER;
    }

    function cancelMarginCallOnBehalfOf(
        address who,
        bytes32
    )
        onlyMargin
        external
        returns (bool)
    {
        return who == CANCELLER;
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
