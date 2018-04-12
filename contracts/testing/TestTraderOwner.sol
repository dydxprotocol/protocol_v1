pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { TraderOwner } from "../margin/interfaces/TraderOwner.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


contract TestTraderOwner is TraderOwner {
    using SafeMath for uint256;

    address public TO_RETURN;
    bool public TO_RETURN_ON_ADD;

    mapping(bytes32 => mapping(address => bool)) public hasReceived;
    mapping(bytes32 => mapping(address => uint256)) public valueAdded;

    function TestTraderOwner(
        address margin,
        address toReturn,
        bool toReturnOnAdd
    )
        public
        TraderOwner(margin)
    {
        if (toReturn == address(1)) {
            TO_RETURN = address(this);
        } else {
            TO_RETURN = toReturn;
        }

        TO_RETURN_ON_ADD = toReturnOnAdd;
    }

    function receiveOwnershipAsTrader(
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

    function marginPositionIncreased(
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
