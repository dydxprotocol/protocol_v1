pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { LiquidateDelegator } from "../margin/interfaces/LiquidateDelegator.sol";


contract TestLiquidateDelegator is LiquidateDelegator {

    address public CLOSER;

    function TestLiquidateDelegator(
        address margin,
        address closer
    )
        public
        LiquidateDelegator(margin)
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

    function liquidateOnBehalfOf(
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
