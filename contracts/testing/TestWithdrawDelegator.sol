pragma solidity 0.4.19;

import { WithdrawDelegator } from "../short/interfaces/WithdrawDelegator.sol";


contract TestWithdrawDelegator is WithdrawDelegator {

    address public CLOSER;

    function TestWithdrawDelegator(
        address shortSell,
        address closer
    )
        public
        WithdrawDelegator(shortSell)
    {
        CLOSER = closer;
    }

    function receiveLoanOwnership(
        address,
        bytes32
    )
        onlyShortSell
        external
        returns (address)
    {
        return address(this);
    }

    function closeOnBehalfOf(
        address who,
        address,
        bytes32,
        uint256 requestedAmount
    )
        onlyShortSell
        external
        returns (uint256)
    {
        return who == CLOSER ? requestedAmount : 0;
    }
}
