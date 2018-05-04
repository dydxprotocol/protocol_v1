pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";


/**
 * @title MarginAdmin
 * @author dYdX
 *
 * Contains admin functions for the Margin contract
 * The owner can put Margin into vatious close-only modes, which will disallow new position creation
 */
contract MarginAdmin is Ownable {
    // ============ Enums ============

    /**
     * Enum containing the possible operation states of Margin:
     *
     * OPERATIONAL                      - All functionality enabled
     * CLOSE_AND_CANCEL_LOAN_ONLY       - Only closing functions + cancelLoanOffering allowed
     *                                    (marginCall, closePosition, cancelLoanOffering
     *                                    closePositionDirectly, forceRecoverCollateral)
     * CLOSE_ONLY                       - Only closing functions allowed (marginCall, closePosition,
     *                                    closePositionDirectly, forceRecoverCollateral)
     * CLOSE_DIRECTLY_ONLY              - Only closing functions allowed (marginCall,
     *                                    closePositionDirectly, forceRecoverCollateral)
     */
    enum OperationState {
        OPERATIONAL,
        CLOSE_AND_CANCEL_LOAN_ONLY,
        CLOSE_ONLY,
        CLOSE_DIRECTLY_ONLY
    }

    // ============ Events ============

    /**
     * Event indicating the operation state has changed
     */
    event OperationStateChanged(
        OperationState from,
        OperationState to
    );

    // ============ State Variables ============

    OperationState public operationState;

    // ============ Constructor ============

    constructor()
        public
        Ownable()
    {
        operationState = OperationState.OPERATIONAL;
    }

    // ============ Modifiers ============

    modifier onlyWhileOperational() {
        require(
            operationState == OperationState.OPERATIONAL,
            "MarginAdmin#onlyWhileOperational: Can only call while operational"
        );
        _;
    }

    modifier cancelLoanOfferingStateControl() {
        require(
            operationState == OperationState.OPERATIONAL
            || operationState == OperationState.CLOSE_AND_CANCEL_LOAN_ONLY,
            "MarginAdmin#cancelLoanOfferingStateControl: Invalid operation state"
        );
        _;
    }

    modifier closePositionStateControl() {
        require(
            operationState == OperationState.OPERATIONAL
            || operationState == OperationState.CLOSE_AND_CANCEL_LOAN_ONLY
            || operationState == OperationState.CLOSE_ONLY,
            "MarginAdmin#closePositionStateControl: Invalid operation state"
        );
        _;
    }

    modifier closePositionDirectlyStateControl() {
        _;
    }

    // ============ Owner-Only State-Changing Functions ============

    function setOperationState(
        OperationState state
    )
        external
        onlyOwner
    {
        if (state != operationState) {
            emit OperationStateChanged(
                operationState,
                state
            );

            operationState = state;
        }
    }
}
