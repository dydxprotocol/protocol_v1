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

import { Math } from "openzeppelin-solidity/contracts/math/Math.sol";
import { BucketLender } from "./BucketLender.sol";
import { MarginHelper } from "../../external/lib/MarginHelper.sol";
import { MarginCommon } from "../../impl/MarginCommon.sol";


/**
 * @title BucketLenderWithRecoveryDelay
 * @author dYdX
 *
 * Extension of BucketLender that delays the force-recovery time
 */
contract BucketLenderWithRecoveryDelay is BucketLender
{
    // ============ State Variables ============

    // number of seconds after position has closed that must be waited before force-recovering
    uint256 public RECOVERY_DELAY;

    // ============ Constructor ============

    constructor(
        address margin,
        bytes32 positionId,
        address heldToken,
        address owedToken,
        uint32[7] parameters,
        address[] trustedMarginCallers,
        address[] trustedWithdrawers,
        uint256 recoveryDelay
    )
        public
        BucketLender(
            margin,
            positionId,
            heldToken,
            owedToken,
            parameters,
            trustedMarginCallers,
            trustedWithdrawers
        )
    {
        RECOVERY_DELAY = recoveryDelay;
    }

    // ============ Margin-Only State-Changing Functions ============

    // Overrides the function in BucketLender
    function forceRecoverCollateralOnBehalfOf(
        address /* recoverer */,
        bytes32 positionId,
        address recipient
    )
        external
        onlyMargin
        nonReentrant
        onlyPosition(positionId)
        returns (address)
    {
        MarginCommon.Position memory position = MarginHelper.getPosition(DYDX_MARGIN, positionId);
        uint256 positionEnd = uint256(position.startTimestamp).add(position.maxDuration);
        if (position.callTimestamp > 0) {
            uint256 marginCallEnd = uint256(position.callTimestamp).add(position.callTimeLimit);
            positionEnd = Math.min256(positionEnd, marginCallEnd);
        }

        require (
            block.timestamp >= positionEnd.add(RECOVERY_DELAY),
            "BucketLenderWithRecoveryDelay#forceRecoverCollateralOnBehalfOf: Recovery too early"
        );

        return forceRecoverCollateralInternal(recipient);
    }
}
