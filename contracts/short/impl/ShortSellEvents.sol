pragma solidity 0.4.21;
pragma experimental "v0.5.0";


/**
 * @title ShortSellEvents
 * @author dYdX
 *
 * Contains events for the ShortSell contract.
 * NOTE: Any ShortSell function libraries that use events will need to both define the event here
 *       and copy the event intothe library itself as libraries don't support sharing events
 */
contract ShortSellEvents {
    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short sell occurred
     */
    event ShortInitiated(
        bytes32 indexed id,
        address indexed shortSeller,
        address indexed lender,
        bytes32 loanHash,
        address baseToken,
        address quoteToken,
        address loanFeeRecipient,
        uint256 shortAmount,
        uint256 quoteTokenFromSell,
        uint256 depositAmount,
        uint256 interestRate,
        uint32  callTimeLimit,
        uint32  maxDuration,
        uint32  interestPeriod
    );

    /**
     * A short sell was closed
     */
    event ShortClosed(
        bytes32 indexed id,
        address indexed closer,
        address indexed payoutRecipient,
        uint256 closeAmount,
        uint256 remainingAmount,
        uint256 baseTokenPaidToLender,
        uint256 quoteTokenPayout,
        uint256 buybackCost
    );

    /**
     * A loan was liquidated
     */
    event LoanLiquidated(
        bytes32 indexed id,
        address indexed liquidator,
        uint256 liquidatedAmount,
        uint256 remainingAmount,
        uint256 quoteAmount
    );

    /**
     * A short sell loan was forcibly recovered by the lender
     */
    event LoanForceRecovered(
        bytes32 indexed id,
        uint256 amount
    );

    /**
     * The loan for a short sell was called in
     */
    event LoanCalled(
        bytes32 indexed id,
        address indexed lender,
        address indexed shortSeller,
        uint256 requiredDeposit
    );

    /**
     * A loan call was canceled
     */
    event LoanCallCanceled(
        bytes32 indexed id,
        address indexed lender,
        address indexed shortSeller,
        uint256 depositAmount
    );

    /**
     * A loan offering was canceled before it was used. Any amount less than the
     * total for the loan offering can be canceled.
     */
    event LoanOfferingCanceled(
        bytes32 indexed loanHash,
        address indexed lender,
        address indexed feeRecipient,
        uint256 cancelAmount
    );

    /**
     * A loan offering was approved on-chain by a lender
     */
    event LoanOfferingApproved(
        bytes32 indexed loanHash,
        address indexed lender,
        address indexed feeRecipient
    );

    /**
     * Additional deposit for a short sell was posted by the short seller
     */
    event AdditionalDeposit(
        bytes32 indexed id,
        uint256 amount,
        address depositor
    );

    /**
     * Ownership of a loan was transferred to a new address
     */
    event LoanTransferred(
        bytes32 indexed id,
        address indexed from,
        address indexed to
    );

    /**
     * Ownership of a short was transferred to a new address
     */
    event ShortTransferred(
        bytes32 indexed id,
        address indexed from,
        address indexed to
    );

    /*
     * Value was added to a short sell
     */
     event ValueAddedToShort(
         bytes32 indexed id,
         address indexed shortSeller,
         address indexed lender,
         address shortOwner,
         address loanOwner,
         bytes32 loanHash,
         address loanFeeRecipient,
         uint256 amountBorrowed,
         uint256 effectiveAmountAdded,
         uint256 quoteTokenFromSell,
         uint256 depositAmount
     );
}
