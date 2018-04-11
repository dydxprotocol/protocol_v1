pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ShortOwner } from "../short/interfaces/ShortOwner.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


contract TestShortOwner is ShortOwner {
    using SafeMath for uint256;

    address public TO_RETURN;
    bool public TO_RETURN_ON_ADD;

    mapping(bytes32 => mapping(address => bool)) public hasReceived;
    mapping(bytes32 => mapping(address => uint256)) public valueAdded;

    function TestShortOwner(
        address shortSell,
        address toReturn,
        bool toReturnOnAdd
    )
        public
        ShortOwner(shortSell)
    {
        if (toReturn == address(1)) {
            TO_RETURN = address(this);
        } else {
            TO_RETURN = toReturn;
        }

        TO_RETURN_ON_ADD = toReturnOnAdd;
    }

    function receiveShortOwnership(
        address from,
        bytes32 shortId
    )
        onlyShortSell
        external
        returns (address)
    {
        hasReceived[shortId][from] = true;
        return TO_RETURN;
    }

    function additionalShortValueAdded(
        address from,
        bytes32 shortId,
        uint256 amount
    )
        onlyShortSell
        external
        returns (bool)
    {
        valueAdded[shortId][from] = valueAdded[shortId][from].add(amount);
        return TO_RETURN_ON_ADD;
    }
}
