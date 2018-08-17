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
import { DepositCollateralDelegator } from "../interfaces/owner/DepositCollateralDelegator.sol";


/**
 * @title DepositCollateralImpl
 * @author dYdX
 *
 * This library contains the implementation for the deposit function of Margin
 */
library DepositCollateralImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * Additional collateral for a position was posted by the owner
     */
    event AdditionalCollateralDeposited(
        bytes32 indexed positionId,
        uint256 amount,
        address depositor
    );

    /**
     * A margin call was canceled
     */
    event MarginCallCanceled(
        bytes32 indexed positionId,
        address indexed lender,
        address indexed owner,
        uint256 depositAmount
    );

    // ============ Public Implementation Functions ============

    function depositCollateralImpl(
        MarginState.State storage state,
        bytes32 positionId,
        uint256 depositAmount
    )
        public
    {
        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        require(
            depositAmount > 0,
            "DepositCollateralImpl#depositCollateralImpl: Deposit amount cannot be 0"
        );

        // Ensure owner consent
        depositCollateralOnBehalfOfRecurse(
            position.owner,
            msg.sender,
            positionId,
            depositAmount
        );

        Vault(state.VAULT).transferToVault(
            positionId,
            position.heldToken,
            msg.sender,
            depositAmount
        );

        // cancel margin call if applicable
        bool marginCallCanceled = false;
        uint256 requiredDeposit = position.requiredDeposit;
        if (position.callTimestamp > 0 && requiredDeposit > 0) {
            if (depositAmount >= requiredDeposit) {
                position.requiredDeposit = 0;
                position.callTimestamp = 0;
                marginCallCanceled = true;
            } else {
                position.requiredDeposit = position.requiredDeposit.sub(depositAmount);
            }
        }

        emit AdditionalCollateralDeposited(
            positionId,
            depositAmount,
            msg.sender
        );

        if (marginCallCanceled) {
            emit MarginCallCanceled(
                positionId,
                position.lender,
                msg.sender,
                depositAmount
            );
        }
    }

    // ============ Private Helper-Functions ============

    function depositCollateralOnBehalfOfRecurse(
        address contractAddr,
        address depositor,
        bytes32 positionId,
        uint256 amount
    )
        private
    {
        // no need to ask for permission
        if (depositor == contractAddr) {
            return;
        }

        address newContractAddr =
            DepositCollateralDelegator(contractAddr).depositCollateralOnBehalfOf(
                depositor,
                positionId,
                amount
            );

        // if not equal, recurse
        if (newContractAddr != contractAddr) {
            depositCollateralOnBehalfOfRecurse(
                newContractAddr,
                depositor,
                positionId,
                amount
            );
        }
    }
}
