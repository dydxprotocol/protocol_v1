pragma solidity 0.4.19;

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
     *                                    forceRecoverLoan)
     * CLOSE_ONLY                       - Only closing functions allowed (callInLoan, closeShort,
     *                                    forceRecoverLoan)
     * SHORT_SELLER_CLOSE_0X_ONLY       - Only closing by the short seller with order is allowed
     *                                    (callInLoan, closeShort, forceRecoverLoan)
     */
    enum OperationState {
        OPERATIONAL,
        CLOSE_AND_CANCEL_LOAN_ONLY,
        CLOSE_ONLY
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
            || operationState == OperationState.CLOSE_ONLY
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
            OperationStateChanged(
                operationState,
                state
            );

            operationState = state;
        }
    }
}
