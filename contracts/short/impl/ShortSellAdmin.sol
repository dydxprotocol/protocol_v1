pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { Ownable } from "zeppelin-solidity/contracts/ownership/Ownable.sol";


/**
 * @title ShortSellAdmin
 * @author dYdX
 *
 * Contains admin functions for the ShortSell contract
 * The owner can put ShortSell into vatious close-only modes, which will disallow all new
 * short creation
 */
contract ShortSellAdmin is Ownable {
    // -----------------------
    // -------- Enums --------
    // -----------------------

    /**
     * Enum containing the possible operation states of ShortSell:
     *
     * OPERATIONAL                      - All functionality enabled
     * CLOSE_AND_CANCEL_LOAN_ONLY       - Only closing functions + cancelLoanOffering allowed
     *                                    (callInLoan, closeShort, cancelLoanOffering
     *                                    closeShortDirectly, forceRecoverLoan)
     * CLOSE_ONLY                       - Only closing functions allowed (callInLoan, closeShort,
     *                                    closeShortDirectly, forceRecoverLoan)
     * CLOSE_DIRECTLY_ONLY              - Only closing functions allowed (callInLoan,
     *                                    closeShortDirectly, forceRecoverLoan)
     */
    enum OperationState {
        OPERATIONAL,
        CLOSE_AND_CANCEL_LOAN_ONLY,
        CLOSE_ONLY,
        CLOSE_DIRECTLY_ONLY
    }

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * Event indicating the operation state has changed
     */
    event OperationStateChanged(
        OperationState from,
        OperationState to
    );

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    OperationState public operationState;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortSellAdmin()
        public
    {
        operationState = OperationState.OPERATIONAL;
    }

    // ---------------------------
    // -------- Modifiers --------
    // ---------------------------

    modifier onlyWhileOperational() {
        require(operationState == OperationState.OPERATIONAL);
        _;
    }

    modifier cancelLoanOfferingStateControl() {
        require(
            operationState == OperationState.OPERATIONAL
            || operationState == OperationState.CLOSE_AND_CANCEL_LOAN_ONLY
        );
        _;
    }

    modifier closeShortStateControl() {
        require(
            operationState == OperationState.OPERATIONAL
            || operationState == OperationState.CLOSE_AND_CANCEL_LOAN_ONLY
            || operationState == OperationState.CLOSE_ONLY
        );
        _;
    }

    modifier closeShortDirectlyStateControl() {
        require(
            operationState == OperationState.OPERATIONAL
            || operationState == OperationState.CLOSE_AND_CANCEL_LOAN_ONLY
            || operationState == OperationState.CLOSE_ONLY
            || operationState == OperationState.CLOSE_DIRECTLY_ONLY
        );
        _;
    }

    // -----------------------------------------
    // -- Owner Only State Changing Functions --
    // -----------------------------------------

    function setOperationState(
        OperationState state
    )
        onlyOwner
        external
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
