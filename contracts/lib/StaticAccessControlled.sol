/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { AccessControlledBase } from "./AccessControlledBase.sol";


/**
 * @title StaticAccessControlled
 * @author dYdX
 *
 * Allows for functions to be access controled
 * Permissions cannot be changed after a grace period
 */
contract StaticAccessControlled is AccessControlledBase, Ownable {
    using SafeMath for uint256;

    // ============ State Variables ============

    // Timestamp after which no additional access can be granted
    uint256 public GRACE_PERIOD_EXPIRATION;

    // ============ Constructor ============

    constructor(
        uint256 gracePeriod
    )
        public
        Ownable()
    {
        GRACE_PERIOD_EXPIRATION = block.timestamp.add(gracePeriod);
    }

    // ============ Owner-Only State-Changing Functions ============

    function grantAccess(
        address who
    )
        external
        onlyOwner
    {
        require(
            block.timestamp < GRACE_PERIOD_EXPIRATION,
            "StaticAccessControlled#grantAccess: Cannot grant access after grace period"
        );

        emit AccessGranted(who);
        authorized[who] = true;
    }
}
