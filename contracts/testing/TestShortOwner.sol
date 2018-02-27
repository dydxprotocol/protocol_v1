pragma solidity 0.4.19;

import { ShortOwner } from "../short/interfaces/ShortOwner.sol";


contract TestShortOwner is ShortOwner {

    address public toReturn;

    function TestShortOwner(
        address _shortSell,
        address _toReturn
    )
        public
        ShortOwner(_shortSell)
    {
        toReturn = _toReturn;
    }

    function recieveShortOwnership(
        address,
        bytes32
    )
        onlyShortSell
        external
        returns (address owner)
    {
        return toReturn;
    }
}
