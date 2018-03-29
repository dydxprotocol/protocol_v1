pragma solidity 0.4.19;

import { LoanOwner } from "../short/interfaces/LoanOwner.sol";


contract TestLoanOwner is LoanOwner {

    address public TO_RETURN;

    function TestLoanOwner(
        address shortSell,
        address toReturn
    )
        public
        LoanOwner(shortSell)
    {
        TO_RETURN = toReturn;
    }

    function receiveLoanOwnership(
        address,
        bytes32
    )
        onlyShortSell
        external
        returns (address)
    {
        return TO_RETURN;
    }

    function additionalLoanValueAdded(
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
