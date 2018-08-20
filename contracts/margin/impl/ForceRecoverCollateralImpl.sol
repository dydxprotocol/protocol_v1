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
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Vault } from "../Vault.sol";
/* solium-disable-next-line max-len*/
import { ForceRecoverCollateralDelegator } from "../interfaces/lender/ForceRecoverCollateralDelegator.sol";


/**
 * @title ForceRecoverCollateralImpl
 * @author dYdX
 *
 * This library contains the implementation for the forceRecoverCollateral function of Margin
 */
library ForceRecoverCollateralImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * Collateral for a position was forcibly recovered
     */
    event CollateralForceRecovered(
        bytes32 indexed positionId,
        address indexed recipient,
        uint256 amount
    );

    // ============ Public Implementation Functions ============

    function forceRecoverCollateralImpl(
        MarginState.State storage state,
        bytes32 positionId,
        address recipient
    )
        public
        returns (uint256)
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        // Can only force recover after either:
        // 1) The loan was called and the call period has elapsed
        // 2) The maxDuration of the position has elapsed
        require( /* solium-disable-next-line */
            (
                position.callTimestamp > 0
                && block.timestamp >= uint256(position.callTimestamp).add(position.callTimeLimit)
            ) || (
                block.timestamp >= uint256(position.startTimestamp).add(position.maxDuration)
            ),
            "ForceRecoverCollateralImpl#forceRecoverCollateralImpl: Cannot recover yet"
        );

        // Ensure lender consent
        forceRecoverCollateralOnBehalfOfRecurse(
            position.lender,
            msg.sender,
            positionId,
            recipient
        );

        // Send the tokens
        uint256 heldTokenRecovered = MarginCommon.getPositionBalanceImpl(state, positionId);
        Vault(state.VAULT).transferFromVault(
            positionId,
            position.heldToken,
            recipient,
            heldTokenRecovered
        );

        // Delete the position
        // NOTE: Since position is a storage pointer, this will also set all fields on
        //       the position variable to 0
        MarginCommon.cleanupPosition(
            state,
            positionId
        );

        // Log an event
        emit CollateralForceRecovered(
            positionId,
            recipient,
            heldTokenRecovered
        );

        return heldTokenRecovered;
    }

    // ============ Private Helper-Functions ============

    function forceRecoverCollateralOnBehalfOfRecurse(
        address contractAddr,
        address recoverer,
        bytes32 positionId,
        address recipient
    )
        private
    {
        // no need to ask for permission
        if (recoverer == contractAddr) {
            return;
        }

        address newContractAddr =
            ForceRecoverCollateralDelegator(contractAddr).forceRecoverCollateralOnBehalfOf(
                recoverer,
                positionId,
                recipient
            );

        if (newContractAddr != contractAddr) {
            forceRecoverCollateralOnBehalfOfRecurse(
                newContractAddr,
                recoverer,
                positionId,
                recipient
            );
        }
    }
}
