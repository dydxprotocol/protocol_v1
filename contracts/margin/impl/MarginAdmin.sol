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

import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";


/**
 * @title MarginAdmin
 * @author dYdX
 *
 * Contains admin functions for the Margin contract
 * The owner can put Margin into various close-only modes, which will disallow new position creation
 */
contract MarginAdmin is Ownable {
    // ============ Enums ============

    // All functionality enabled
    uint8 private constant OPERATION_STATE_OPERATIONAL = 0;

    // Only closing functions + cancelLoanOffering allowed (marginCall, closePosition,
    // cancelLoanOffering, closePositionDirectly, forceRecoverCollateral)
    uint8 private constant OPERATION_STATE_CLOSE_AND_CANCEL_LOAN_ONLY = 1;

    // Only closing functions allowed (marginCall, closePosition, closePositionDirectly,
    // forceRecoverCollateral)
    uint8 private constant OPERATION_STATE_CLOSE_ONLY = 2;

    // Only closing functions allowed (marginCall, closePositionDirectly, forceRecoverCollateral)
    uint8 private constant OPERATION_STATE_CLOSE_DIRECTLY_ONLY = 3;

    // This operation state (and any higher) is invalid
    uint8 private constant OPERATION_STATE_INVALID = 4;

    // ============ Events ============

    /**
     * Event indicating the operation state has changed
     */
    event OperationStateChanged(
        uint8 from,
        uint8 to
    );

    // ============ State Variables ============

    uint8 public operationState;

    // ============ Constructor ============

    constructor()
        public
        Ownable()
    {
        operationState = OPERATION_STATE_OPERATIONAL;
    }

    // ============ Modifiers ============

    modifier onlyWhileOperational() {
        require(
            operationState == OPERATION_STATE_OPERATIONAL,
            "MarginAdmin#onlyWhileOperational: Can only call while operational"
        );
        _;
    }

    modifier cancelLoanOfferingStateControl() {
        require(
            operationState == OPERATION_STATE_OPERATIONAL
            || operationState == OPERATION_STATE_CLOSE_AND_CANCEL_LOAN_ONLY,
            "MarginAdmin#cancelLoanOfferingStateControl: Invalid operation state"
        );
        _;
    }

    modifier closePositionStateControl() {
        require(
            operationState == OPERATION_STATE_OPERATIONAL
            || operationState == OPERATION_STATE_CLOSE_AND_CANCEL_LOAN_ONLY
            || operationState == OPERATION_STATE_CLOSE_ONLY,
            "MarginAdmin#closePositionStateControl: Invalid operation state"
        );
        _;
    }

    modifier closePositionDirectlyStateControl() {
        _;
    }

    // ============ Owner-Only State-Changing Functions ============

    function setOperationState(
        uint8 newState
    )
        external
        onlyOwner
    {
        require(
            newState < OPERATION_STATE_INVALID,
            "MarginAdmin#setOperationState: newState is not a valid operation state"
        );

        if (newState != operationState) {
            emit OperationStateChanged(
                operationState,
                newState
            );
            operationState = newState;
        }
    }
}
