pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ShortOwner } from "../margin/interfaces/ShortOwner.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


contract TestShortOwner is ShortOwner {
    using SafeMath for uint256;

    address public TO_RETURN;
    bool public TO_RETURN_ON_ADD;

    mapping(bytes32 => mapping(address => bool)) public hasReceived;
    mapping(bytes32 => mapping(address => uint256)) public valueAdded;

    function TestShortOwner(
        address margin,
        address toReturn,
        bool toReturnOnAdd
    )
        public
        ShortOwner(margin)
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
        bytes32 marginId
    )
        onlyMargin
        external
        returns (address)
    {
        hasReceived[marginId][from] = true;
        return TO_RETURN;
    }

    function additionalShortValueAdded(
        address from,
        bytes32 marginId,
        uint256 amount
    )
        onlyMargin
        external
        returns (bool)
    {
        valueAdded[marginId][from] = valueAdded[marginId][from].add(amount);
        return TO_RETURN_ON_ADD;
    }
}
