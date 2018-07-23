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

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ERC20Long } from "./ERC20Long.sol";


/**
 * @title ERC20CappedLong
 * @author dYdX
 *
 * CappedToken version of an ERC20Long
 */
contract ERC20CappedLong is ERC20Long {
    using SafeMath for uint256;

    uint256 tokenCap;

    constructor(
        bytes32 positionId,
        address margin,
        address initialTokenHolder,
        address[] trustedRecipients,
        uint256 cap
    )
        public
        ERC20Long(
            positionId,
            margin,
            initialTokenHolder,
            trustedRecipients
        )
    {
        tokenCap = cap;
    }

    // ============ Private Functions ============

    function getTokenAmountOnAdd(
        uint256 principalAdded
    )
        internal
        view
        returns (uint256)
    {
        uint256 tokenAmount = super.getTokenAmountOnAdd(principalAdded);

        require(totalSupply_.add(tokenAmount) <= tokenCap);

        return tokenAmount;
    }
}
