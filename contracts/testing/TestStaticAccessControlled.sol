pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { StaticAccessControlled } from "../lib/StaticAccessControlled.sol";


contract TestStaticAccessControlled is StaticAccessControlled {
    uint public num;

    constructor(
        uint _gracePeriod
    )
        StaticAccessControlled(_gracePeriod)
        public
    {}

    function setNum(
        uint to
    )
        requiresAuthorization
        external
    {
        num = to;
    }
}
