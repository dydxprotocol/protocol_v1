pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ShortOwner } from "../short/interfaces/ShortOwner.sol";


contract TestShortOwner is ShortOwner {

    address public TO_RETURN;

    function TestShortOwner(
        address shortSell,
        address toReturn
    )
        public
        ShortOwner(shortSell)
    {
        TO_RETURN = toReturn;
    }

    function receiveShortOwnership(
        address,
        bytes32
    )
        onlyShortSell
        external
        returns (address)
    {
        return TO_RETURN;
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
