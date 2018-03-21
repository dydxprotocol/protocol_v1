pragma solidity 0.4.19;

import { LoanOwner } from "../short/interfaces/LoanOwner.sol";


contract TestLoanOwner is LoanOwner {

    address public toReturn;

    function TestLoanOwner(
        address _shortSell,
        address _toReturn
    )
        public
        LoanOwner(_shortSell)
    {
        toReturn = _toReturn;
    }

    function receiveLoanOwnership(
        address,
        bytes32
    )
        onlyShortSell
        external
        returns (address owner)
    {
        return toReturn;
    }
}
