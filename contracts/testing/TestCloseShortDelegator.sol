pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { CloseShortDelegator } from "../margin/interfaces/CloseShortDelegator.sol";


contract TestCloseShortDelegator is CloseShortDelegator {

    address public CLOSER;
    bool public IS_DEGENERATE; // if true, returns more than requestedAmount;

    function TestCloseShortDelegator(
        address shortSell,
        address closer,
        bool isDegenerate
    )
        public
        CloseShortDelegator(shortSell)
    {
        CLOSER = closer;
        IS_DEGENERATE = isDegenerate;
    }

    function receiveShortOwnership(
        address,
        bytes32
    )
        onlyShortSell
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
        onlyShortSell
        external
        returns (uint256)
    {
        uint256 amount = (IS_DEGENERATE ? requestedAmount + 1 : requestedAmount);
        return who == CLOSER ? amount : 0;
    }

    function additionalShortValueAdded(
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
