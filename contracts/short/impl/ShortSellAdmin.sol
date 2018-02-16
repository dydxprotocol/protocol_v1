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
     *                                    closeShortDirectly, placeSellbackBid, forceRecoverLoan)
     * CLOSE_ONLY                       - Only closing functions allowed (callInLoan, closeShort,
     *                                    closeShortDirectly, placeSellbackBid, forceRecoverLoan)
     * AUCTION_CLOSE_ONLY               - Only auction closing functions allowed
     *                                    (callInLoan, placeSellbackBid, forceRecoverLoan)
     * AUCTION_AND_DIRECT_CLOSE_ONLY    - Only auction + direct closing functions allowed
     *                                    (callInLoan, placeSellbackBid, closeShortDirectlyforceRecoverLoan)
     * SHORT_SELLER_CLOSE_ONLY          - Only closing by the short seller is allowed (callInLoan,
     *                                    closeShort, closeShortDirectly, forceRecoverLoan)
     * SHORT_SELLER_CLOSE_DIRECTLY_ONLY - Only direct closing by the short seller is allowed
     *                                    (callInLoan, closeShortDirectly, forceRecoverLoan)
     * SHORT_SELLER_CLOSE_0X_ONLY       - Only closing by the short seller with order is allowed
     *                                    (callInLoan, closeShort, forceRecoverLoan)
     */
    enum OperationState {
        OPERATIONAL,
        CLOSE_AND_CANCEL_LOAN_ONLY,
        CLOSE_ONLY,
        AUCTION_CLOSE_ONLY,
        SHORT_SELLER_CLOSE_ONLY,
        SHORT_SELLER_CLOSE_DIRECTLY_ONLY,
        SHORT_SELLER_CLOSE_0X_ONLY
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

    modifier auctionStateControl() {
        require(
            operationState == OperationState.OPERATIONAL
            || operationState == OperationState.CLOSE_ONLY
            || operationState == OperationState.AUCTION_CLOSE_ONLY
            || operationState == OperationState.CLOSE_AND_CANCEL_LOAN_ONLY
        );
        _;
    }

    modifier closeShortStateControl() {
        require(
            operationState == OperationState.OPERATIONAL
            || operationState == OperationState.CLOSE_ONLY
            || operationState == OperationState.SHORT_SELLER_CLOSE_ONLY
            || operationState == OperationState.SHORT_SELLER_CLOSE_0X_ONLY
            || operationState == OperationState.CLOSE_AND_CANCEL_LOAN_ONLY
        );
        _;
    }

    modifier closeShortDirectlyStateControl() {
        require(
            operationState == OperationState.OPERATIONAL
            || operationState == OperationState.CLOSE_ONLY
            || operationState == OperationState.SHORT_SELLER_CLOSE_ONLY
            || operationState == OperationState.SHORT_SELLER_CLOSE_DIRECTLY_ONLY
            || operationState == OperationState.CLOSE_AND_CANCEL_LOAN_ONLY
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
