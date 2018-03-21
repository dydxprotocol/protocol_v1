pragma solidity 0.4.19;

import { CloseShortDelegator } from "../short/interfaces/CloseShortDelegator.sol";


contract TestCloseShortDelegator is CloseShortDelegator {

    address public CLOSER;

    function TestCloseShortDelegator(
        address shortSell,
        address closer
    )
        public
        CloseShortDelegator(shortSell)
    {
        CLOSER = closer;
    }

    function receiveShortOwnership(
        address,
        bytes32
    )
        onlyShortSell
        external
        returns (address owner)
    {
        return address(this);
    }

    function closeOnBehalfOf(
        address who,
        address,
        bytes32,
        uint256 requestedAmount
    )
        onlyShortSell
        external
        returns (uint256 allowedAmount)
    {
        return who == CLOSER ? requestedAmount : 0;
    }
}
