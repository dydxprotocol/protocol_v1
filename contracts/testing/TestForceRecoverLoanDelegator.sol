pragma solidity 0.4.19;

import { ForceRecoverLoanDelegator } from "../short/interfaces/ForceRecoverLoanDelegator.sol";


contract TestForceRecoverLoanDelegator is ForceRecoverLoanDelegator {

    address public recoverer;

    function TestForceRecoverLoanDelegator(
        address _shortSell,
        address _recoverer
    )
        public
        ForceRecoverLoanDelegator(_shortSell)
    {
        recoverer = _recoverer;
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

    function forceRecoverLoanOnBehalfOf(
        address _who,
        bytes32
    )
        onlyShortSell
        external
        returns (bool _allowed)
    {
        return _who == recoverer;
    }
}
