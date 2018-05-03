pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ClosePositionDelegator } from "../margin/interfaces/ClosePositionDelegator.sol";
import { PositionOwner } from "../margin/interfaces/PositionOwner.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestPositionOwner is
    OnlyMargin,
    PositionOwner,
    ClosePositionDelegator
{
    using SafeMath for uint256;

    address public TO_RETURN;
    bool public TO_RETURN_ON_ADD;

    mapping(bytes32 => mapping(address => bool)) public hasReceived;
    mapping(bytes32 => mapping(address => uint256)) public valueAdded;

    constructor(
        address margin,
        address toReturn,
        bool toReturnOnAdd
    )
        public
        OnlyMargin(margin)
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
        address trader,
        bytes32 positionId,
        uint256 amount
    )
        onlyMargin
        external
        returns (address)
    {
        valueAdded[positionId][trader] = valueAdded[positionId][trader].add(amount);

        require(TO_RETURN_ON_ADD);

        return address(this);
    }

    function closeOnBehalfOf(
        address,
        address,
        bytes32,
        uint256 requestedAmount
    )
        external
        onlyMargin
        returns (address, uint256)
    {
        return (address(this), requestedAmount);
    }
}
