pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { LoanOwner } from "../margin/interfaces/LoanOwner.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestLoanOwner is OnlyMargin, LoanOwner {
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

    function receiveLoanOwnership(
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

    function marginLoanIncreased(
        address payer,
        bytes32 positionId,
        uint256 principalAdded
    )
        onlyMargin
        external
        returns (address)
    {
        valueAdded[positionId][payer] = valueAdded[positionId][payer].add(principalAdded);

        require(TO_RETURN_ON_ADD);

        return address(this);
    }
}
