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
import { ERC20Long } from "./ERC20Long.sol";


/**
 * @title ERC20CappedLong
 * @author dYdX
 *
 * CappedToken version of an ERC20Long
 */
contract ERC20CappedLong is
    ERC20Long,
    Ownable
{
    using SafeMath for uint256;

    // ============ Events ============

    event TokenCapSet(
        uint256 tokenCap
    );

    // ============ State Variables ============

    uint256 public tokenCap;

    // ============ Constructor ============

    constructor(
        bytes32 positionId,
        address margin,
        address initialTokenHolder,
        address[] trustedRecipients,
        address[] trustedWithdrawers,
        uint256 cap
    )
        public
        Ownable()
        ERC20Long(
            positionId,
            margin,
            initialTokenHolder,
            trustedRecipients,
            trustedWithdrawers
        )
    {
        setTokenCapInternal(cap);
    }

    // ============ Owner-Only Functions ============

    function setTokenCap(
        uint256 newCap
    )
        external
        onlyOwner
    {
        setTokenCapInternal(newCap);
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

        require(
            totalSupply_.add(tokenAmount) <= tokenCap,
            "ERC20CappedLong#getTokenAmountOnAdd: Adding tokenAmount would exceed cap"
        );

        return tokenAmount;
    }

    function setTokenCapInternal(
        uint256 newCap
    )
        private
    {
        // We do not need to require that the tokenCap is >= totalSupply_ because the cap is only
        // checked when increasing the position. It does not prevent any other functionality
        tokenCap = newCap;
        emit TokenCapSet(newCap);
    }
}
