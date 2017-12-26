pragma solidity 0.4.18;

import "../lib/AccessControlled.sol";


contract AccessControlledTester is AccessControlled {
    uint public num;

    function AccessControlledTester(
        uint _accessDelay,
        uint _gracePeriod
    )
        AccessControlled(_accessDelay, _gracePeriod)
        public
    {}

    function setNum(
        uint to
    )
        requiresAuthorization
        public
    {
        num = to;
    }
}
