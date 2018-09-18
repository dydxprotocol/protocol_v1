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
import { ERC20Short } from "./ERC20Short.sol";
import { MarginCommon } from "../../impl/MarginCommon.sol";
import { MarginHelper } from "../lib/MarginHelper.sol";


/**
 * @title ProductionERC20Short
 * @author dYdX
 *
 * Early production version of an ERC20Short with a token cap and a trusted closer
 */
contract ProductionERC20Short is
    ERC20Short,
    Ownable
{
    using SafeMath for uint256;

    // ============ Events ============

    event TokenCapSet(
        uint256 tokenCap
    );

    // ============ State Variables ============

    address public TRUSTED_LATE_CLOSER;

    uint256 public tokenCap;

    // ============ Constructor ============

    constructor(
        bytes32 positionId,
        address margin,
        address initialTokenHolder,
        address[] trustedRecipients,
        address[] trustedWithdrawers,
        uint256 cap,
        address trustedLateCloser
    )
        public
        Ownable()
        ERC20Short(
            positionId,
            margin,
            initialTokenHolder,
            trustedRecipients,
            trustedWithdrawers
        )
    {
        TRUSTED_LATE_CLOSER = trustedLateCloser;
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

    // ============ Internal Overriding Functions ============

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
            "ProductionERC20Short#getTokenAmountOnAdd: Adding tokenAmount would exceed cap"
        );

        return tokenAmount;
    }

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
                closer == TRUSTED_LATE_CLOSER,
                "ProductionERC20Short#closeUsingTrustedRecipient: Not TRUSTED_LATE_CLOSER"
            );
        }

        return super.closeUsingTrustedRecipient(closer, payoutRecipient, requestedAmount);
    }
}
