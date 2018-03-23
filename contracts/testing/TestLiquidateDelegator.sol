pragma solidity 0.4.19;

import { LiquidateDelegator } from "../short/interfaces/LiquidateDelegator.sol";


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
        bytes32,
        uint256 requestedAmount
    )
        onlyShortSell
        external
        returns (uint256)
    {
        return who == CLOSER ? requestedAmount : 0;
    }
}
