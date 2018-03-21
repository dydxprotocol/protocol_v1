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
        returns (address owner)
    {
        return TO_RETURN;
    }
}
