pragma solidity 0.4.19;

import { CallLoanDelegator } from "../short/interfaces/CallLoanDelegator.sol";


contract TestCallLoanDelegator is CallLoanDelegator {

    address public caller;
    address public canceller;

    function TestCallLoanDelegator(
        address _shortSell,
        address _caller,
        address _canceller
    )
        public
        CallLoanDelegator(_shortSell)
    {
        caller = _caller;
        canceller = _canceller;
    }

    function recieveLoanOwnership(
        address,
        bytes32
    )
        onlyShortSell
        external
        returns (address owner)
    {
        return address(this);
    }

    function callOnBehalfOf(
        address _who,
        bytes32,
        uint256
    )
        onlyShortSell
        external
        returns (bool _allowed)
    {
        return _who == caller;
    }

    function cancelLoanCallOnBehalfOf(
        address _who,
        bytes32
    )
        onlyShortSell
        external
        returns (bool _allowed)
    {
        return _who == canceller;
    }
}
