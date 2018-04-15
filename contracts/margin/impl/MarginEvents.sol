pragma solidity 0.4.21;
pragma experimental "v0.5.0";


/**
 * @title MarginEvents
 * @author dYdX
 *
 * Contains events for the Margin contract.
 * NOTE: Any Margin function libraries that use events will need to both define the event here
 *       and copy the event intothe library itself as libraries don't support sharing events
 */
contract MarginEvents {
    // ============ Events ============

    /**
     * A position was opened
     */
    event PositionOpened(
        bytes32 indexed positionId,
        address indexed trader,
        address indexed lender,
        bytes32 loanHash,
        address baseToken,
        address quoteToken,
        address loanFeeRecipient,
        uint256 principal,
        uint256 quoteTokenFromSell,
        uint256 depositAmount,
        uint256 interestRate,
        uint32  callTimeLimit,
        uint32  maxDuration,
        uint32  interestPeriod
    );

    /**
     * A position was closed or partially closed
     */
    event PositionClosed(
        bytes32 indexed positionId,
        address indexed closer,
        address indexed payoutRecipient,
        uint256 closeAmount,
        uint256 remainingAmount,
        uint256 baseTokenPaidToLender,
        uint256 payoutAmount,
        uint256 buybackCost,
        bool payoutInQuoteToken
    );

    /**
     * A loan was liquidated
     */
    event PositionLiquidated(
        bytes32 indexed positionId,
        address indexed liquidator,
        address indexed payoutRecipient,
        uint256 liquidatedAmount,
        uint256 remainingAmount,
        uint256 quoteTokenPayout
    );

    /**
     * Collateral was forcibly recovered by the lender
     */
    event CollateralForceRecovered(
        bytes32 indexed positionId,
        uint256 amount
    );

    /**
     * A position was margin called
     */
    event MarginCallInitiated(
        bytes32 indexed positionId,
        address indexed lender,
        address indexed owner,
        uint256 requiredDeposit
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
     * Additional collateral for a position was posted by the owner
     */
    event AdditionalCollateralDeposited(
        bytes32 indexed positionId,
        uint256 amount,
        address depositor
    );

    /**
     * Ownership of a loan was transferred to a new address
     */
    event LoanTransferred(
        bytes32 indexed positionId,
        address indexed from,
        address indexed to
    );

    /**
     * Ownership of a position was transferred to a new address
     */
    event PositionTransferred(
        bytes32 indexed positionId,
        address indexed from,
        address indexed to
    );

    /*
     * A position was increased in size
     */
    event PositionIncreased(
        bytes32 indexed positionId,
        address indexed trader,
        address indexed lender,
        address positionOwner,
        address loanOwner,
        bytes32 loanHash,
        address loanFeeRecipient,
        uint256 amountBorrowed,
        uint256 principalAdded,
        uint256 quoteTokenFromSell,
        uint256 depositAmount
    );
}
