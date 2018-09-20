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
import { ERC20Position } from "./ERC20Position.sol";
import { MarginCommon } from "../../impl/MarginCommon.sol";
import { MarginHelper } from "../lib/MarginHelper.sol";


/**
 * @title ERC20CappedPosition
 * @author dYdX
 *
 * ERC20 Position with a limit on the number of tokens that can be minted, and a restriction on
 * which addreses can close the position after it is force-recoverable.
 */
contract ERC20CappedPosition is
    ERC20Position,
    Ownable
{
    using SafeMath for uint256;

    // ============ Events ============

    event TokenCapSet(
        uint256 tokenCap
    );

    event TrustedCloserSet(
        address closer,
        bool allowed
    );

    // ============ State Variables ============

    mapping(address => bool) public TRUSTED_LATE_CLOSERS;

    uint256 public tokenCap;

    // ============ Constructor ============

    constructor(
        address[] trustedLateClosers,
        uint256 cap
    )
        public
        Ownable()
    {
        for (uint256 i = 0; i < trustedLateClosers.length; i++) {
            TRUSTED_LATE_CLOSERS[trustedLateClosers[i]] = true;
        }
        tokenCap = cap;
    }

    // ============ Owner-Only Functions ============

    function setTokenCap(
        uint256 newCap
    )
        external
        onlyOwner
    {
        // We do not need to require that the tokenCap is >= totalSupply_ because the cap is only
        // checked when increasing the position. It does not prevent any other functionality
        tokenCap = newCap;
        emit TokenCapSet(newCap);
    }

    function setTrustedLateCloser(
        address closer,
        bool allowed
    )
        external
        onlyOwner
    {
        TRUSTED_LATE_CLOSERS[closer] = allowed;
        emit TrustedCloserSet(closer, allowed);
    }

    // ============ Internal Overriding Functions ============

    // overrides the function in ERC20Position
    function closeUsingTrustedRecipient(
        address closer,
        address payoutRecipient,
        uint256 requestedAmount
    )
        internal
        returns (uint256)
    {
        MarginCommon.Position memory position = MarginHelper.getPosition(DYDX_MARGIN, POSITION_ID);

        bool afterEnd =
            block.timestamp > uint256(position.startTimestamp).add(position.maxDuration);
        bool afterCall =
            position.callTimestamp > 0 &&
            block.timestamp > uint256(position.callTimestamp).add(position.callTimeLimit);

        if (afterCall || afterEnd) {
            require (
                TRUSTED_LATE_CLOSERS[closer],
                "ERC20CappedPosition#closeUsingTrustedRecipient: closer not in TRUSTED_LATE_CLOSERS"
            );
        }

        return super.closeUsingTrustedRecipient(closer, payoutRecipient, requestedAmount);
    }
}
