pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ClosePositionDelegator } from "../margin/interfaces/ClosePositionDelegator.sol";


contract TestClosePositionDelegator is ClosePositionDelegator {

    address public CLOSER;
    bool public IS_DEGENERATE; // if true, returns more than requestedAmount;

    function TestClosePositionDelegator(
        address margin,
        address closer,
        bool isDegenerate
    )
        public
        ClosePositionDelegator(margin)
    {
        CLOSER = closer;
        IS_DEGENERATE = isDegenerate;
    }

    function receivePositionOwnership(
        address,
        bytes32
    )
        onlyMargin
        external
        returns (address)
    {
        return address(this);
    }

    function closePositionOnBehalfOf(
        address who,
        address,
        bytes32,
        uint256 requestedAmount
    )
        onlyMargin
        external
        returns (uint256)
    {
        uint256 amount = (IS_DEGENERATE ? requestedAmount + 1 : requestedAmount);
        return who == CLOSER ? amount : 0;
    }

    function marginPositionIncreased(
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
