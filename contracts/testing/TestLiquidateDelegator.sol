pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { LiquidateDelegator } from "../margin/interfaces/LiquidateDelegator.sol";


contract TestLiquidateDelegator is LiquidateDelegator {

    address public CLOSER;

    function TestLiquidateDelegator(
        address shortSell,
        address closer
    )
        public
        LiquidateDelegator(shortSell)
    {
        CLOSER = closer;
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

    function liquidateOnBehalfOf(
        address who,
        address,
        bytes32,
        uint256 requestedAmount
    )
        onlyShortSell
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
        onlyShortSell
        external
        returns (bool)
    {
        return false;
    }
}
