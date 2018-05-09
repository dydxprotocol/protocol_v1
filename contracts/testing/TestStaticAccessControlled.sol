pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { StaticAccessControlled } from "../lib/StaticAccessControlled.sol";


contract TestStaticAccessControlled is StaticAccessControlled {
    uint256 public num;

    constructor(
        uint256 _gracePeriod
    )
        StaticAccessControlled(_gracePeriod)
        public
    {}

    function setNum(
        uint256 to
    )
        requiresAuthorization
        external
    {
        num = to;
    }
}
