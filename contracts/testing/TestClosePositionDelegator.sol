pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { ClosePositionDelegator } from "../margin/interfaces/ClosePositionDelegator.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestClosePositionDelegator is OnlyMargin, ClosePositionDelegator {

    address public CLOSER;
    bool public IS_DEGENERATE; // if true, returns more than requestedAmount;

    constructor(
        address margin,
        address closer,
        bool isDegenerate
    )
        public
        OnlyMargin(margin)
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

    function closeOnBehalfOf(
        address who,
        address,
        bytes32,
        uint256 requestedAmount
    )
        onlyMargin
        external
        returns (address, uint256)
    {
        uint256 amount = (IS_DEGENERATE ? requestedAmount + 1 : requestedAmount);

        if (who == CLOSER) {
            return (address(this), amount);
        }

        revert();
    }

    function marginPositionIncreased(
        address,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (address)
    {
        revert();
    }
}
