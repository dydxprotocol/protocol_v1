pragma solidity 0.4.19;

import { CloseShortDelegator } from "../short/interfaces/CloseShortDelegator.sol";


contract TestCloseShortDelegator is CloseShortDelegator {

    address public closer;

    function TestCloseShortDelegator(
        address _shortSell,
        address _closer
    )
        public
        CloseShortDelegator(_shortSell)
    {
        closer = _closer;
    }

    function receiveShortOwnership(
        address,
        bytes32
    )
        onlyShortSell
        external
        returns (address owner)
    {
        return address(this);
    }

    function closeOnBehalfOf(
        address _who,
        bytes32,
        uint256 _requestedAmount
    )
        onlyShortSell
        external
        returns (uint256 _allowedAmount)
    {
        return _who == closer ? _requestedAmount : 0;
    }
}
