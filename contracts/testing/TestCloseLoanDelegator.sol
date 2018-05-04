pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { CloseLoanDelegator } from "../margin/interfaces/CloseLoanDelegator.sol";
import { OnlyMargin } from "../margin/interfaces/OnlyMargin.sol";


contract TestCloseLoanDelegator is OnlyMargin, CloseLoanDelegator {

    address public CLOSER;

    constructor(
        address margin,
        address closer
    )
        public
        OnlyMargin(margin)
    {
        CLOSER = closer;
    }

    function receiveLoanOwnership(
        address,
        bytes32
    )
        onlyMargin
        external
        returns (address)
    {
        return address(this);
    }

    function closeLoanOnBehalfOf(
        address who,
        address,
        bytes32,
        uint256 requestedAmount
    )
        onlyMargin
        external
        returns (uint256)
    {
        return who == CLOSER ? requestedAmount : 0;
    }

    function marginLoanIncreased(
        address,
        bytes32,
        uint256
    )
        onlyMargin
        external
        returns (bool)
    {
        return false;
    }
}
