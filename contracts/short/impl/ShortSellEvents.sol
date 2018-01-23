pragma solidity 0.4.18;


/**
 * @title ShortSellEvents
 * @author Antonio Juliano
 *
 * This contract contains the events for the ShortSell contract
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
        address underlyingToken,
        address baseToken,
        address loanFeeRecipient,
        uint shortAmount,
        uint baseTokenFromSell,
        uint depositAmount,
        uint32 lockoutTime,
        uint32 callTimeLimit,
        uint32 maxDuration,
        uint interestRate,
        uint timestamp
    );

    /**
     * A short sell was closed
     */
    event ShortClosed(
        bytes32 indexed id,
        uint closeAmount,
        uint interestFee,
        uint shortSellerBaseToken,
        uint buybackCost,
        uint timestamp
    );

    /**
     * A short sell was partially closed
     */
    event ShortPartiallyClosed(
        bytes32 indexed id,
        uint closeAmount,
        uint remainingAmount,
        uint interestFee,
        uint shortSellerBaseToken,
        uint buybackCost,
        uint timestamp
    );

    /**
     * The loan for a short sell was called in
     */
    event LoanCalled(
        bytes32 indexed id,
        address indexed lender,
        address indexed shortSeller,
        address caller,
        uint timestamp
    );

    /**
     * A loan call was canceled
     */
    event LoanCallCanceled(
        bytes32 indexed id,
        address indexed lender,
        address indexed shortSeller,
        address caller,
        uint timestamp
    );

    /**
     * A short sell loan was forcibly recovered by the lender
     */
    event LoanForceRecovered(
        bytes32 indexed id,
        address indexed winningBidder,
        uint amount,
        bool hadAcutcionOffer,
        uint buybackCost,
        uint timestamp
    );

    /**
     * Additional deposit for a short sell was posted by the short seller
     */
    event AdditionalDeposit(
        bytes32 indexed id,
        uint amount,
        uint timestamp
    );

    /**
     * A loan offering was canceled before it was used. Any amount less than the
     * total for the loan offering can be canceled.
     */
    event LoanOfferingCanceled(
        bytes32 indexed loanHash,
        address indexed lender,
        address indexed feeRecipient,
        uint cancelAmount,
        uint timestamp
    );

    /**
     * Ownership of a loan was transfered to a new address
     */
    event LoanTransfered(
        bytes32 indexed id,
        address from,
        address to,
        uint timestamp
    );

    /**
     * Ownership of a short was transfered to a new address
     */
    event ShortTransfered(
        bytes32 indexed id,
        address from,
        address to,
        uint timestamp
    );

    /**
     * A bid was placed to sell back the underlying token required to close
     * a short position
     */
    event AuctionBidPlaced(
        bytes32 indexed id,
        address indexed bidder,
        uint bid,
        uint currentShortAmount,
        uint timestamp
    );
}
