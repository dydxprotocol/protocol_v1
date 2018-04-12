pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { LiquidatePositionDelegator } from "../margin/interfaces/LiquidatePositionDelegator.sol";


contract TestLiquidatePositionDelegator is LiquidatePositionDelegator {

    address public CLOSER;

    function TestLiquidatePositionDelegator(
        address margin,
        address closer
    )
        public
        LiquidatePositionDelegator(margin)
    {
        CLOSER = closer;
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

    function liquidatePositionOnBehalfOf(
        address who,
        address,
        bytes32,
        uint256 requestedAmount
    )
        onlyMargin
        external
        returns (uint256)
    {
        return who == CLOSER ? requestedAmount : 0;
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
