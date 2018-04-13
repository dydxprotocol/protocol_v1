pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { LoanOwner } from "../margin/interfaces/LoanOwner.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


contract TestLoanOwner is LoanOwner {
    using SafeMath for uint256;

    address public TO_RETURN;
    bool public TO_RETURN_ON_ADD;

    mapping(bytes32 => mapping(address => bool)) public hasReceived;
    mapping(bytes32 => mapping(address => uint256)) public valueAdded;

    function TestLoanOwner(
        address margin,
        address toReturn,
        bool toReturnOnAdd
    )
        public
        LoanOwner(margin)
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
        bytes32 shortId
    )
        onlyMargin
        external
        returns (address)
    {
        hasReceived[shortId][from] = true;
        return TO_RETURN;
    }

    function additionalLoanValueAdded(
        address from,
        bytes32 shortId,
        uint256 amount
    )
        onlyMargin
        external
        returns (bool)
    {
        valueAdded[shortId][from] = valueAdded[shortId][from].add(amount);
        return TO_RETURN_ON_ADD;
    }
}
