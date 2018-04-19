pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ClosePositionDelegator } from "../margin/interfaces/ClosePositionDelegator.sol";
import { PositionOwner } from "../margin/interfaces/PositionOwner.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


contract TestPositionOwner is
    PositionOwner,
    ClosePositionDelegator
{
    using SafeMath for uint256;

    address public TO_RETURN;
    bool public TO_RETURN_ON_ADD;

    mapping(bytes32 => mapping(address => bool)) public hasReceived;
    mapping(bytes32 => mapping(address => uint256)) public valueAdded;

    function TestPositionOwner(
        address margin,
        address toReturn,
        bool toReturnOnAdd
    )
        public
        ClosePositionDelegator(margin)
        PositionOwner(margin)
    {
        if (toReturn == address(1)) {
            TO_RETURN = address(this);
        } else {
            TO_RETURN = toReturn;
        }

        TO_RETURN_ON_ADD = toReturnOnAdd;
    }

    function receivePositionOwnership(
        address from,
        bytes32 positionId
    )
        onlyMargin
        external
        returns (address)
    {
        hasReceived[positionId][from] = true;
        return TO_RETURN;
    }

    function marginPositionIncreased(
        address from,
        bytes32 positionId,
        uint256 amount
    )
        onlyMargin
        external
        returns (bool)
    {
        valueAdded[positionId][from] = valueAdded[positionId][from].add(amount);
        return TO_RETURN_ON_ADD;
    }

    function closeOnBehalfOf(
        address closer,
        address payoutRecipient,
        bytes32 positionId,
        uint256 requestedAmount
    )
        external
        onlyMargin
        returns (uint256)
    {
        return requestedAmount;
    }
}
