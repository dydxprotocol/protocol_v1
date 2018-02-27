pragma solidity 0.4.19;

import { ShortCloser } from "../short/interfaces/ShortCloser.sol";


contract TestShortCloser is ShortCloser {

    address public closer;

    function TestShortCloser(
        address _shortSell,
        address _closer
    )
        public
        ShortCloser(_shortSell)
    {
        closer = _closer;
    }

    function recieveShortOwnership(
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
