pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import '../lib/SafeMath.sol';
import "../shared/Proxy.sol";
import "./Vault.sol";
import "./Trader.sol";
import "./ShortSellRepo.sol";
import "./ShortSellAuctionRepo.sol";


/**
 * @title ShortSell
 * @author Antonio Juliano
 *
 * This contract is used to facilitate short selling as per the dYdX short sell protocol
 */
contract ShortSell is Ownable, SafeMath, DelayedUpdate, NoOwner, ReentrancyGuard {
    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct ShortTx {
        address underlyingToken;
        address baseToken;
        uint shortAmount;
        uint depositAmount;
        LoanOffering loanOffering;
        BuyOrder buyOrder;
    }

    struct CloseShortTx {
        Short short;
        uint currentShortAmount;
        bytes32 shortId;
        uint closeAmount;
        address[5] orderAddresses;
        uint[6] orderValues;
        uint8 orderV;
        bytes32 orderR;
        bytes32 orderS;
    }

    struct LoanOffering {
        address lender;
        address taker;
        address feeRecipient;
        address lenderFeeToken;
        address takerFeeToken;
        LoanRates rates;
        uint expirationTimestamp;
        uint32 lockoutTime;
        uint32 callTimeLimit;
        uint salt;
        bytes32 loanHash;
        Signature signature;
    }

    struct LoanRates {
        uint minimumDeposit;
        uint minimumSellAmount;
        uint maxAmount;
        uint minAmount;
        uint interestRate;
        uint lenderFee;
        uint takerFee;
    }

    struct BuyOrder {
        address maker;
        address taker;
        address feeRecipient;
        address makerFeeToken;
        address takerFeeToken;
        uint baseTokenAmount;
        uint underlyingTokenAmount;
        uint makerFee;
        uint takerFee;
        uint expirationTimestamp;
        uint salt;
        Signature signature;
    }

    struct Signature {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Short {
        address underlyingToken;
        address baseToken;
        uint shortAmount;
        uint closedAmount;
        uint interestRate;
        uint32 callTimeLimit;
        uint32 lockoutTime;
        uint32 startTimestamp;
        uint32 callTimestamp;
        address lender;
        address seller;
    }

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    // Address of the Vault contract
    address public VAULT;

    // Address of the Trader contract
    address public TRADER;

    // Address of the ShortSellRepo contract
    address public REPO;

    // Address of the ShortSellAuctionRepo contract
    address public AUCTION_REPO;

    // Address of the Proxy contract
    address public PROXY;

    // Mapping from loanHash -> amount, which stores the amount of a loan which has
    // already been filled
    mapping(bytes32 => uint) public loanFills;

    // Mapping from loanHash -> amount, which stores the amount of a loan which has
    // already been canceled
    mapping(bytes32 => uint) public loanCancels;

    // Mapping from loanHash -> number, which stores the number of shorts taken out
    // for a given loan
    mapping(bytes32 => uint) public loanNumbers;

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
        address underlyingToken,
        address baseToken,
        address loanFeeRecipient,
        address buyOrderFeeRecipient,
        uint shortAmount,
        uint baseTokenFromSell,
        uint depositAmount,
        uint32 lockoutTime,
        uint32 callTimeLimit,
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

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function ShortSell(
        address _vault,
        address _repo,
        address _auction_repo,
        address _trader,
        address _proxy,
        uint _updateDelay,
        uint _updateExpiration
    )
        Ownable()
        DelayedUpdate(_updateDelay, _updateExpiration)
        public
    {
        VAULT = _vault;
        REPO = _repo;
        TRADER = _trader;
        PROXY = _proxy;
        AUCTION_REPO = _auction_repo;
    }

    // -----------------------------
    // ------ Admin Functions ------
    // -----------------------------

    function updateTrader(
        address _trader
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("TRADER", _trader)
        external
    {
        TRADER = _trader;
    }

    function updateProxy(
        address _proxy
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("PROXY", _proxy)
        external
    {
        PROXY = _proxy;
    }

    function updateVault(
        address _vault
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("VAULT", _vault)
        external
    {
        VAULT = _vault;
    }

    function updateRepo(
        address _repo
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("REPO", _repo)
        external
    {
        REPO = _repo;
    }

    function updateAuctionRepo(
        address _auction_repo
    )
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("AUCTION_REPO", _auction_repo)
        external
    {
        AUCTION_REPO = _auction_repo;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    /**
     * Initiate a short sell. Called by the short seller. Short seller must provide both a
     * signed loan offering as well as a signed 0x buy order for the underlying token to
     * be shorted
     *
     * 1 - base token deposit is transfered from the short seller to Vault
     * 2 - underlying token is transfered from lender to Vault
     * 3 - if there is a taker fee for the buy order, transfer it from short seller to Vault
     * 4 - use the provided 0x buy order to sell the loaned underlying token for base token.
     *     base token received from the sell is also stored in Vault
     * 5 - add details of the short sell to repo
     * 6 - Short event recorded
     *
     * Note: This function will by default use the dYdX Exchange contract (which allows fees
     *       to be paid in any token). If you would rather use the official 0x Exchange contract,
     *       set "buy order maker fee token" to the constant specified on Trader, and "buy order
     *       taker fee token" to the address of the ZRX token.
     *
     * @param  addresses  Addresses corresponding to:
     *
     *  [0] = underlying token
     *  [1] = base token
     *  [2] = lender
     *  [3] = loan taker
     *  [4] = loan fee recipient
     *  [5] = loan lender fee token
     *  [6] = loan taker fee token
     *  [7] = buy order maker
     *  [8] = buy order taker
     *  [9] = buy order fee recipient
     *  [10] = buy order maker fee token
     *  [11] = buy order taker fee token
     *
     * @param  values256  Values corresponding to:
     *
     *  [0]  = loan minimum deposit
     *  [1]  = loan maximum amount
     *  [2]  = loan minimum amount
     *  [3]  = loan minimum sell amount
     *  [4]  = loan interest rate
     *  [5]  = loan lender fee
     *  [6]  = loan taker fee
     *  [7]  = loan expiration timestamp (in seconds)
     *  [8]  = loan salt
     *  [9]  = buy order base token amount
     *  [10] = buy order underlying token amount
     *  [11] = buy order maker fee
     *  [12] = buy order taker fee
     *  [13] = buy order expiration timestamp (in seconds)
     *  [14] = buy order salt
     *  [15] = short amount
     *  [16] = deposit amount
     *
     * @param  values32  Values corresponding to:
     *
     *  [0] = loan lockout time (in seconds)
     *  [1] = loan call time limit (in seconds)
     *
     * @param  sigV       ECDSA v parameters for [0] loan and [1] buy order
     * @param  sigRS      CDSA r and s parameters for [0] loan and [2] buy order
     * @return _shortId   unique identifier for the short sell
     */
    function short(
        address[12] addresses,
        uint[17] values256,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        external
        nonReentrant
        returns(bytes32 _shortId)
    {
        ShortTx memory transaction = parseShortTx(
            addresses,
            values256,
            values32,
            sigV,
            sigRS
        );

        bytes32 shortId = getNextShortId(transaction.loanOffering.loanHash);

        // Validate
        validateShort(
            transaction,
            shortId
        );

        // STATE UPDATES

        // Update global amounts for the loan and lender
        loanFills[transaction.loanOffering.loanHash] = add(
            loanFills[transaction.loanOffering.loanHash],
            transaction.shortAmount
        );
        loanNumbers[transaction.loanOffering.loanHash] =
            add(loanNumbers[transaction.loanOffering.loanHash], 1);

        // Check no casting errors
        require(
            uint(uint32(block.timestamp)) == block.timestamp
        );

        ShortSellRepo(REPO).addShort(
            shortId,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.shortAmount,
            transaction.loanOffering.rates.interestRate,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.lockoutTime,
            uint32(block.timestamp),
            transaction.loanOffering.lender,
            msg.sender
        );

        // EXTERNAL CALLS

        // Transfer tokens
        transferTokensForShort(
            shortId,
            transaction
        );

        // Do the sell
        uint baseTokenReceived = executeSell(
            transaction,
            shortId
        );

        // LOG EVENT

        recordShortInitiated(
            shortId,
            msg.sender,
            transaction,
            baseTokenReceived
        );

        return shortId;
    }

    /**
     * Close a short sell. Only callable by short seller. Short seller must provide a 0x order
     * offering at least as much underlying token as was loaned for the short sell. There must be
     * enough base token left over after the trade to pay the lender the full owed interest fee.
     * The short seller is sent base token = deposit + profit - interest fee
     *
     * Note: This function will by default use the dYdX Exchange contract (which allows fees
     *       to be paid in any token). If you would rather use the official 0x Exchange contract,
     *       set "buy order maker fee token" to the constant specified on Trader, and "buy order
     *       taker fee token" to the address of the ZRX token.
     *
     * @param  shortId              unique id for the short sell
     * @param  orderAddresses       Addresses for the supplied 0x order:
     *                              [0] = maker
     *                              [1] = taker
     *                              [2] = fee recipient
     *                              [3] = maker fee token
     *                              [4] = taker fee token
     * @param  orderValues          Values for the supplied 0x order:
     *                              [0] = underlying token amount
     *                              [1] = base token amount
     *                              [2] = maker fee
     *                              [3] = taker fee
     *                              [4] = expiration timestamp
     *                              [5] = salt
     * @param  orderV               ECDSA signature parameter v for the 0x order
     * @param  orderR bytes32       CDSA signature parameter r for the 0x order
     * @param  orderS bytes32       CDSA signature parameter s for the 0x order
     * @return _baseTokenReceived   amount of base token received by the short seller after closing
     * @return _interestFeeAmount   interest fee in base token paid to the lender
     */
    function closeShort(
        bytes32 shortId,
        uint closeAmount,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    )
        public // Used by closeEntireShort
        nonReentrant
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        CloseShortTx memory transaction = parseCloseShortTx(
            shortId,
            closeAmount,
            orderAddresses,
            orderValues,
            orderV,
            orderR,
            orderS
        );

        validateCloseShort(transaction);

        // STATE UPDATES

        // Remove short if it's fully closed, or update the closed amount
        updateStateForCloseShort(transaction);

        // EXTERNAL CALLS

        var (interestFee, buybackCost, sellerBaseTokenAmount) = buybackAndSendOnClose(
            transaction
        );

        logEventOnClose(
            transaction,
            interestFee,
            buybackCost,
            sellerBaseTokenAmount
        );

        return (
            sellerBaseTokenAmount,
            interestFee
        );
    }

    /**
     * Close the entire short position. Follows closeShort documentation.
     */
    function closeEntireShort(
        bytes32 shortId,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    )
        external
        // nonReentrant not needed because closeShort uses the non-reentrant state variable
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        Short memory short = getShortObject(shortId);
        return closeShort(
            shortId,
            short.shortAmount,
            orderAddresses,
            orderValues,
            orderV,
            orderR,
            orderS
        );
    }

    /**
     * Close a short sell. Only callable by short seller. This method to close a short transfers
     * the borrowed underlying tokens directly from the short seller, and does not use a 0x order
     * to buy them back. To use this, the short seller must own the shortAmount of underlyingToken
     *
     * @param  shortId              unique id for the short sell
     * @return _baseTokenReceived   amount of base token received by the short seller after closing
     * @return _interestFeeAmount   interest fee in base token paid to the lender
     */
    function closeShortDirectly(
        bytes32 shortId,
        uint closeAmount
    )
        external
        nonReentrant
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        Short memory short = getShortObject(shortId);
        uint currentShortAmount = sub(short.shortAmount, short.closedAmount);

        require(short.seller == msg.sender);
        require(closeAmount <= currentShortAmount);

        // The amount of interest fee owed to close this proportion of the position
        uint interestFee = calculateInterestFee(
            short,
            closeAmount,
            block.timestamp
        );

        // First transfer base token used for close into new vault. Vault will then validate
        // this is the maximum base token that can be used by this close
        // Prefer to use a new vault, so this close cannot touch the rest of the
        // funds held in the original short vault
        bytes32 closeId = transferToCloseVault(
            short,
            shortId,
            closeAmount
        );

        // STATE UPDATES

        // If the whole short is closed, remove it from repo
        if (closeAmount == currentShortAmount) {
            cleanupShort(
                shortId
            );
        } else {
            // Otherwise increment the closed amount on the short
            ShortSellRepo(REPO).setShortClosedAmount(
                shortId,
                add(short.closedAmount, closeAmount)
            );
        }

        // EXTERNAL CALLS
        Vault(VAULT).transfer(
            closeId,
            short.underlyingToken,
            msg.sender,
            closeAmount
        );

        uint sellerBaseTokenAmount = sendTokensOnClose(
            short,
            closeId,
            closeAmount,
            interestFee
        );

        if (closeAmount == currentShortAmount) {
            // If the whole short is closed and there is an auction offer, send it back
            payBackAuctionBidderIfExists(
                shortId,
                short
            );

            ShortClosed(
                shortId,
                interestFee,
                closeAmount,
                sellerBaseTokenAmount,
                0,
                block.timestamp
            );
        } else {
            ShortPartiallyClosed(
                shortId,
                closeAmount,
                sub(currentShortAmount, closeAmount),
                interestFee,
                sellerBaseTokenAmount,
                0,
                block.timestamp
            );
        }

        return (
            sellerBaseTokenAmount,
            interestFee
        );
    }

    /**
     * Call in a short sell loan.
     * Only callable by the lender for a short sell. After loan is called in, the short seller
     * will have time equal to the call time limit specified on the original short sell to
     * close the short and repay the loan. If the short seller does not close the short, the
     * lender can use forceRecoverLoan to recover his funds.
     *
     * @param  shortId  unique id for the short sell
     */
    function callInLoan(
        bytes32 shortId
    )
        external
        nonReentrant
    {
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);
        require(block.timestamp >= add(short.startTimestamp, short.lockoutTime));
        // Ensure the loan has not already been called
        require(short.callTimestamp == 0);
        require(
            uint(uint32(block.timestamp)) == block.timestamp
        );

        ShortSellRepo(REPO).setShortCallStart(shortId, uint32(block.timestamp));

        LoanCalled(
            shortId,
            short.lender,
            short.seller,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * Cancel a loan call. Only callable by the short sell's lender
     *
     * @param  shortId  unique id for the short sell
     */
    function cancelLoanCall(
        bytes32 shortId
    )
        external
        nonReentrant
    {
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);
        // Ensure the loan has been called
        require(short.callTimestamp > 0);

        ShortSellRepo(REPO).setShortCallStart(shortId, 0);

        payBackAuctionBidderIfExists(
            shortId,
            short
        );

        LoanCallCanceled(
            shortId,
            short.lender,
            short.seller,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * Transfer ownership of a loan to a new address. This new address will be entitled
     * to all payouts for this loan. Only callable by the lender for a short
     *
     * @param  shortId  unique id for the short sell
     * @param  who      new owner of the loan
     */
    function transferLoan(
        bytes32 shortId,
        address who
    )
        external
        nonReentrant
    {
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.lender);

        ShortSellRepo(REPO).setShortLender(shortId, who);

        LoanTransfered(
            shortId,
            short.lender,
            who,
            block.timestamp
        );
    }

    /**
     * Transfer ownership of a short to a new address. This new address will be entitled
     * to all payouts for this short. Only callable by the short seller for a short
     *
     * @param  shortId  unique id for the short sell
     * @param  who      new owner of the short
     */
    function transferShort(
        bytes32 shortId,
        address who
    )
        external
        nonReentrant
    {
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.seller);

        ShortSellRepo(REPO).setShortSeller(shortId, who);

        ShortTransfered(
            shortId,
            short.lender,
            who,
            block.timestamp
        );
    }

    /**
     * Offer to sell back the tokens loaned for a short sell for some amount of base tokens held
     * in this short position. Only the lowest bid amount will be accepted. On placing a bid,
     * the full underlying token amount owed to the lender will be taken from the bidder and
     * placed in escrow. If a bidder is outbid or the short is closed normally by the short seller,
     * the bidder's underlying tokens will be automatically returned.
     * Only callable for a short that has been called, but not yet closed.
     * Callable by any address
     *
     * @param  shortId      ID of the short sell to bid on
     * @param  offer        the amount of base token the bidder wants to be paid in exchange for
     *                      the amount of underlying token in the short sell. The price paid per
     *                      underlying token is: offer / shortAmount (the opening amount
     *                      of the short). Even if the short is partially closed, this amount is
     *                      still relative to the opening short amount
     */
    function placeSellbackBid(
        bytes32 shortId,
        uint offer
    )
        external
        nonReentrant
    {
        Short memory short = getShortObject(shortId);

        // If the short has not been called, return failure
        require(short.callTimestamp > 0);

        var (currentOffer, currentBidder, hasCurrentOffer) = getShortAuctionOffer(shortId);

        // If there is a current offer, the new offer must be for less
        if (hasCurrentOffer) {
            require(offer < currentOffer);
        }

        // Maximum interest fee is what it would be if the entire call time limit elapsed
        uint maxInterestFee = calculateInterestFee(
            short,
            short.startTimestamp,
            add(short.callTimestamp, short.callTimeLimit)
        );

        // The offered amount must be less than the amount of base token held - max interest fee
        require(offer <= sub(getShortBalance(shortId), maxInterestFee));

        // Store auction funds in a separate vault for isolation
        bytes32 auctionVaultId = getAuctionVaultId(shortId);

        // If a previous bidder has been outbid, give them their tokens back
        if (hasCurrentOffer) {
            Vault(VAULT).send(
                auctionVaultId,
                short.underlyingToken,
                currentBidder,
                Vault(VAULT).balances(auctionVaultId, short.underlyingToken)
            );
        }

        // Transfer the full underlying token amount from the bidder
        uint currentShortAmount = sub(short.shortAmount, short.closedAmount);

        Vault(VAULT).transfer(
            auctionVaultId,
            short.underlyingToken,
            msg.sender,
            currentShortAmount
        );

        // Record that the bidder has placed this bid
        ShortSellAuctionRepo(AUCTION_REPO).setAuctionOffer(
            shortId,
            offer,
            msg.sender
        );

        // Log Event
        AuctionBidPlaced(
            shortId,
            msg.sender,
            offer,
            currentShortAmount,
            block.timestamp
        );
    }

    /**
     * Function callable by a short sell lender after he has called in the loan, but the
     * short seller did not close the short sell before the call time limit. Used to recover the
     * lender's original loaned amount of underlying token as well as any owed interest fee
     * This function can also be called by the winner of a sellback auction.
     *
     * @param  shortId  unique id for the short sell
     */
    function forceRecoverLoan(
        bytes32 shortId
    )
        external
        nonReentrant
        returns (uint _baseTokenAmount)
    {
        Short memory short = getShortObject(shortId);
        var (offer, bidder, hasCurrentOffer) = getShortAuctionOffer(shortId);

        // Can only force recover after the entire call period has elapsed
        require(block.timestamp > add(uint(short.callTimestamp), uint(short.callTimeLimit)));

        // Only the lender or the winning bidder can call recover the loan
        require(msg.sender == short.lender || msg.sender == bidder);

        // Delete the short
        cleanupShort(
            shortId
        );

        // Send the tokens
        var (lenderBaseTokenAmount, buybackCost) = sendTokensOnForceRecover(
            short,
            shortId,
            offer,
            bidder,
            hasCurrentOffer
        );

        // Log an event
        LoanForceRecovered(
            shortId,
            lenderBaseTokenAmount,
            hasCurrentOffer,
            buybackCost,
            block.timestamp
        );

        return lenderBaseTokenAmount;
    }

    /**
     * Deposit additional base token as colateral for a short sell loan. Only callable by
     * the short seller
     *
     * @param  shortId          unique id for the short sell
     * @param  depositAmount    additional amount in base token to deposit
     */
    function deposit(
        bytes32 shortId,
        uint depositAmount
    )
        external
        nonReentrant
    {
        Short memory short = getShortObject(shortId);
        require(msg.sender == short.seller);

        Vault(VAULT).transfer(
            shortId,
            short.baseToken,
            short.seller,
            depositAmount
        );

        AdditionalDeposit(
            shortId,
            depositAmount,
            block.timestamp
        );
    }

    /**
     * Cancel an amount of a loan offering. Only callable by the offering's lender.
     *
     * @param  addresses        Array of addresses:
     *
     *  [0] = underlying token
     *  [1] = base token
     *  [2] = lender
     *  [3] = loan taker
     *  [4] = loan fee recipient
     *  [5] = loan lender fee token
     *  [6] = loan taker fee token
     *
     * @param  values256        Values corresponding to:
     *
     *  [0]  = loan minimum deposit
     *  [1]  = loan maximum amount
     *  [2]  = loan minimum amount
     *  [3]  = loan minimum sell amount
     *  [4]  = loan interest rate
     *  [5]  = loan lender fee
     *  [6]  = loan taker fee
     *  [7]  = loan expiration timestamp (in seconds)
     *  [8]  = loan salt
     *
     * @param  values32         Values corresponding to:
     *
     *  [0] = loan lockout time (in seconds)
     *  [1] = loan call time limit (in seconds)
     *
     * @param  cancelAmount     Amount to cancel
     * @return _cancelledAmount Amount that was cancelled
     */
    function cancelLoanOffering(
        address[7] addresses,
        uint[9] values256,
        uint32[2] values32,
        uint cancelAmount
    )
        external
        nonReentrant
        returns (uint _cancelledAmount)
    {
        LoanOffering memory loanOffering = parseLoanOffering(
            addresses,
            values256,
            values32
        );

        require(loanOffering.lender == msg.sender);
        require(loanOffering.expirationTimestamp > block.timestamp);

        uint remainingAmount = sub(
            loanOffering.rates.maxAmount,
            getUnavailableLoanOfferingAmount(loanOffering.loanHash)
        );
        uint amountToCancel = min256(remainingAmount, cancelAmount);

        require(amountToCancel > 0);

        loanCancels[loanOffering.loanHash] = add(
            loanCancels[loanOffering.loanHash],
            amountToCancel
        );

        LoanOfferingCanceled(
            loanOffering.loanHash,
            loanOffering.lender,
            amountToCancel,
            block.timestamp
        );

        return amountToCancel;
    }

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    function getShort(
        bytes32 shortId
    )
        view
        public
        returns (
            address underlyingToken,
            address baseToken,
            uint shortAmount,
            uint interestRate,
            uint closedAmount,
            uint32 callTimeLimit,
            uint32 lockoutTime,
            uint32 startTimestamp,
            uint32 callTimestamp,
            address lender,
            address seller
        )
    {
        return ShortSellRepo(REPO).getShort(shortId);
    }

    function containsShort(
        bytes32 shortId
    )
        view
        public
        returns (bool exists)
    {
        return ShortSellRepo(REPO).containsShort(shortId);
    }

    function getShortBalance(
        bytes32 shortId
    )
        view
        public
        returns (uint _baseTokenBalance)
    {
        if (!ShortSellRepo(REPO).containsShort(shortId)) {
            return 0;
        }
        Short memory short = getShortObject(shortId);

        return Vault(VAULT).balances(shortId, short.baseToken);
    }

    function getShortInterestFee(
        bytes32 shortId
    )
        view
        public
        returns (uint _interestFeeOwed)
    {
        if (!ShortSellRepo(REPO).containsShort(shortId)) {
            return 0;
        }
        Short memory short = getShortObject(shortId);

        uint endTimestamp;

        if (
            short.callTimestamp > 0
            && block.timestamp > add(short.callTimestamp, short.callTimeLimit)
        ) {
            endTimestamp = add(short.callTimestamp, short.callTimeLimit);
        } else {
            endTimestamp = block.timestamp;
        }

        return calculateInterestFee(
            short,
            sub(short.shortAmount, short.closedAmount),
            endTimestamp
        );
    }

    function getUnavailableLoanOfferingAmount(
        bytes32 loanHash
    )
        view
        public
        returns (uint _unavailableAmount)
    {
        return add(loanFills[loanHash], loanCancels[loanHash]);
    }

    function getShortAuctionOffer(
        bytes32 shortId
    )
        view
        public
        returns (
            uint _offer,
            address _taker,
            bool _exists
        )
    {
        return ShortSellAuctionRepo(AUCTION_REPO).getAuction(shortId);
    }

    function hasShortAuctionOffer(
        bytes32 shortId
    )
        view
        public
        returns (bool _exists)
    {
        return ShortSellAuctionRepo(AUCTION_REPO).containsAuction(shortId);
    }

    function isShortCalled(
        bytes32 shortId
    )
        view
        public
        returns(bool _isCalled)
    {
        Short memory short = getShortObject(shortId);

        return (short.callTimestamp > 0);
    }

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    function getNextShortId(
        bytes32 loanHash
    )
        internal
        view
        returns (bytes32 _shortId)
    {
        return keccak256(
            loanHash,
            loanNumbers[loanHash]
        );
    }

    function isValidSignature(
        LoanOffering loanOffering
    )
        internal
        pure
        returns (bool _isValid)
    {
        return loanOffering.lender == ecrecover(
            keccak256("\x19Ethereum Signed Message:\n32", loanOffering.loanHash),
            loanOffering.signature.v,
            loanOffering.signature.r,
            loanOffering.signature.s
        );
    }

    function validateShort(
        ShortTx transaction,
        bytes32 shortId
    )
        internal
        view
    {
        // Make sure we don't already have this short id
        require(!containsShort(shortId));

        // If the taker is 0x000... then anyone can take it. Otherwise only the taker can use it
        if (transaction.loanOffering.taker != address(0)) {
            require(msg.sender == transaction.loanOffering.taker);
        }

        // Check Signature
        require(
            isValidSignature(transaction.loanOffering)
        );

        // Validate the short amount is <= than max and >= min
        require(
            add(
                transaction.shortAmount,
                getUnavailableLoanOfferingAmount(transaction.loanOffering.loanHash)
            ) <= transaction.loanOffering.rates.maxAmount
        );
        require(transaction.shortAmount >= transaction.loanOffering.rates.minAmount);

        uint minimumDeposit = getPartialAmount(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.minimumDeposit
        );

        require(transaction.depositAmount >= minimumDeposit);
        require(transaction.loanOffering.expirationTimestamp > block.timestamp);

        /*  Validate the minimum sell price
         *
         *    loan min sell            buy order base token amount
         *  -----------------  <=  -----------------------------------
         *   loan max amount        buy order underlying token amount
         *
         *                      |
         *                      V
         *
         *  loan min sell * buy order underlying token amount
         *  <= buy order base token amount * loan max amount
         */

        require(
            mul(
                transaction.loanOffering.rates.minimumSellAmount,
                transaction.buyOrder.underlyingTokenAmount
            ) <= mul(
                transaction.loanOffering.rates.maxAmount,
                transaction.buyOrder.baseTokenAmount
            )
        );
    }

    function executeSell(
        ShortTx transaction,
        bytes32 shortId
    )
        internal
        returns (uint _baseTokenReceived)
    {
        var ( , baseTokenReceived) = Trader(TRADER).trade(
            shortId,
            [
                transaction.buyOrder.maker,
                transaction.buyOrder.taker,
                transaction.baseToken,
                transaction.underlyingToken,
                transaction.buyOrder.feeRecipient,
                transaction.buyOrder.makerFeeToken,
                transaction.buyOrder.takerFeeToken
            ],
            [
                transaction.buyOrder.baseTokenAmount,
                transaction.buyOrder.underlyingTokenAmount,
                transaction.buyOrder.makerFee,
                transaction.buyOrder.takerFee,
                transaction.buyOrder.expirationTimestamp,
                transaction.buyOrder.salt
            ],
            transaction.shortAmount,
            transaction.buyOrder.signature.v,
            transaction.buyOrder.signature.r,
            transaction.buyOrder.signature.s,
            true
        );

        Vault vault = Vault(VAULT);

        // Should hold base token == deposit amount + base token from sell
        assert(
            vault.balances(
                shortId,
                transaction.baseToken
            ) == add(baseTokenReceived, transaction.depositAmount)
        );

        // Should hold 0 underlying token
        assert(vault.balances(shortId, transaction.underlyingToken) == 0);

        return baseTokenReceived;
    }

    function getLoanOfferingHash(
        LoanOffering loanOffering,
        address baseToken,
        address underlyingToken
    )
        internal
        view
        returns (bytes32 _hash)
    {
        return keccak256(
            address(this),
            underlyingToken,
            baseToken,
            loanOffering.lender,
            loanOffering.taker,
            loanOffering.feeRecipient,
            loanOffering.lenderFeeToken,
            loanOffering.takerFeeToken,
            getValuesHash(loanOffering)
        );
    }

    function getValuesHash(
        LoanOffering loanOffering
    )
        internal
        pure
        returns (bytes32 _hash)
    {
        return keccak256(
            loanOffering.rates.minimumDeposit,
            loanOffering.rates.maxAmount,
            loanOffering.rates.minAmount,
            loanOffering.rates.minimumSellAmount,
            loanOffering.rates.interestRate,
            loanOffering.rates.lenderFee,
            loanOffering.rates.takerFee,
            loanOffering.expirationTimestamp,
            loanOffering.lockoutTime,
            loanOffering.callTimeLimit,
            loanOffering.salt
        );
    }

    function transferTokensForShort(
        bytes32 shortId,
        ShortTx transaction
    )
        internal
    {
        transferTokensFromShortSeller(
            shortId,
            transaction
        );

        // Transfer underlying token
        Vault(VAULT).transfer(
            shortId,
            transaction.underlyingToken,
            transaction.loanOffering.lender,
            transaction.shortAmount
        );

        // Transfer loan fees
        transferLoanFees(
            transaction
        );
    }

    function transferTokensFromShortSeller(
        bytes32 shortId,
        ShortTx transaction
    )
        internal
    {
        // Calculate Fee
        uint buyOrderTakerFee = getPartialAmount(
            transaction.shortAmount,
            transaction.buyOrder.underlyingTokenAmount,
            transaction.buyOrder.takerFee
        );

        // Transfer deposit and buy taker fee
        if (transaction.buyOrder.feeRecipient == address(0)) {
            Vault(VAULT).transfer(
                shortId,
                transaction.baseToken,
                msg.sender,
                transaction.depositAmount
            );
        } else if (transaction.baseToken == transaction.buyOrder.takerFeeToken) {
            // If the buy order taker fee token is base token
            // we can just transfer base token once from the short seller

            Vault(VAULT).transfer(
                shortId,
                transaction.baseToken,
                msg.sender,
                add(transaction.depositAmount, buyOrderTakerFee)
            );
        } else {
            // Otherwise transfer the deposit and buy order taker fee separately
            Vault(VAULT).transfer(
                shortId,
                transaction.baseToken,
                msg.sender,
                transaction.depositAmount
            );

            Vault(VAULT).transfer(
                shortId,
                transaction.buyOrder.takerFeeToken,
                msg.sender,
                buyOrderTakerFee
            );
        }
    }

    function transferLoanFees(
        ShortTx transaction
    )
        internal
    {
        Proxy proxy = Proxy(PROXY);
        uint lenderFee = getPartialAmount(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.lenderFee
        );
        proxy.transferTo(
            transaction.loanOffering.lenderFeeToken,
            transaction.loanOffering.lender,
            transaction.loanOffering.feeRecipient,
            lenderFee
        );
        uint takerFee = getPartialAmount(
            transaction.shortAmount,
            transaction.loanOffering.rates.maxAmount,
            transaction.loanOffering.rates.takerFee
        );
        proxy.transferTo(
            transaction.loanOffering.takerFeeToken,
            msg.sender,
            transaction.loanOffering.feeRecipient,
            takerFee
        );
    }

    function recordShortInitiated(
        bytes32 shortId,
        address shortSeller,
        ShortTx transaction,
        uint baseTokenReceived
    )
        internal
    {
        ShortInitiated(
            shortId,
            shortSeller,
            transaction.loanOffering.lender,
            transaction.underlyingToken,
            transaction.baseToken,
            transaction.loanOffering.feeRecipient,
            transaction.buyOrder.feeRecipient,
            transaction.shortAmount,
            baseTokenReceived,
            transaction.depositAmount,
            transaction.loanOffering.lockoutTime,
            transaction.loanOffering.callTimeLimit,
            transaction.loanOffering.rates.interestRate,
            block.timestamp
        );
    }

    function calculateInterestFee(
        Short short,
        uint closeAmount,
        uint endTimestamp
    )
        internal
        pure
        returns (uint _interestFee)
    {
        // The interest rate for the proportion of the position being closed
        uint interestRate = getPartialAmount(
            closeAmount,
            short.shortAmount,
            short.interestRate
        );

        uint timeElapsed = sub(endTimestamp, short.startTimestamp);
        // TODO implement more complex interest rates
        return getPartialAmount(timeElapsed, 1 days, interestRate);
    }

    // ----- closeShort Internal Functions -----

    function validateCloseShort(
        CloseShortTx transaction
    )
        internal
        view
    {
        require(transaction.short.seller == msg.sender);
        require(transaction.closeAmount <= transaction.currentShortAmount);
    }

    function updateStateForCloseShort(
        CloseShortTx transaction
    )
        internal
    {
        // If the whole short is closed, remove it from repo
        if (transaction.closeAmount == transaction.currentShortAmount) {
            cleanupShort(
                transaction.shortId
            );
        } else {
            // Otherwise increment the closed amount on the short
            ShortSellRepo(REPO).setShortClosedAmount(
                transaction.shortId,
                add(transaction.short.closedAmount, transaction.closeAmount)
            );
        }
    }

    function buybackAndSendOnClose(
        CloseShortTx transaction
    )
        internal
        returns (
            uint _interestFee,
            uint _buybackCost,
            uint _sellerBaseTokenAmount
        )
    {
        // The amount of interest fee owed to close this proportion of the position
        uint interestFee = calculateInterestFee(
            transaction.short,
            transaction.closeAmount,
            block.timestamp
        );

        // First transfer base token used for close into new vault. Vault will then validate
        // this is the maximum base token that can be used by this close
        // Prefer to use a new vault, so this close cannot touch the rest of the
        // funds held in the original short vault
        bytes32 closeId = transferToCloseVault(
            transaction.short,
            transaction.shortId,
            transaction.closeAmount
        );

        uint buybackCost = buyBackUnderlyingToken(
            transaction,
            closeId,
            interestFee
        );

        uint sellerBaseTokenAmount = sendTokensOnClose(
            transaction.short,
            closeId,
            transaction.closeAmount,
            interestFee
        );

        if (transaction.closeAmount == transaction.currentShortAmount) {
            // If the whole short is closed and there is an auction offer, send it back
            payBackAuctionBidderIfExists(
                transaction.shortId,
                transaction.short
            );
        }

        return (
            interestFee,
            buybackCost,
            sellerBaseTokenAmount
        );
    }

    function transferToCloseVault(
        Short short,
        bytes32 shortId,
        uint closeAmount
    )
        internal
        returns (bytes32 _closeId)
    {
        uint currentShortAmount = sub(short.shortAmount, short.closedAmount);

        // The maximum amount of base token that can be used by this close
        uint baseTokenShare = getPartialAmount(
            closeAmount,
            currentShortAmount,
            Vault(VAULT).balances(shortId, short.baseToken)
        );

        bytes32 closeId = keccak256(shortId, "CLOSE");
        Vault(VAULT).transferBetweenVaults(
            shortId,
            closeId,
            short.baseToken,
            baseTokenShare
        );

        return closeId;
    }

    function buyBackUnderlyingToken(
        CloseShortTx transaction,
        bytes32 closeId,
        uint interestFee
    )
        internal
        returns (uint _buybackCost)
    {
        uint baseTokenPrice = getBaseTokenPriceForBuyback(
            transaction.short,
            transaction.closeAmount,
            interestFee,
            closeId,
            transaction.orderValues
        );

        if (transaction.orderAddresses[2] != address(0)) {
            transferFeeForBuyback(
                closeId,
                transaction.orderValues,
                transaction.orderAddresses[4],
                baseTokenPrice
            );
        }

        var (buybackCost, ) = Trader(TRADER).trade(
            closeId,
            [
                transaction.orderAddresses[0],
                transaction.orderAddresses[1],
                transaction.short.underlyingToken,
                transaction.short.baseToken,
                transaction.orderAddresses[2],
                transaction.orderAddresses[3],
                transaction.orderAddresses[4]
            ],
            transaction.orderValues,
            baseTokenPrice,
            transaction.orderV,
            transaction.orderR,
            transaction.orderS,
            true
        );

        assert(
            Vault(VAULT).balances(
                closeId, transaction.short.underlyingToken
            ) == transaction.closeAmount
        );

        // Assert fee token balance is 0 (orderAddresses[4] is the takerFeeToken)
        assert(Vault(VAULT).balances(closeId, transaction.orderAddresses[4]) == 0);

        return buybackCost;
    }

    function getBaseTokenPriceForBuyback(
        Short short,
        uint closeAmount,
        uint interestFee,
        bytes32 closeId,
        uint[6] orderValues
    )
        internal
        view
        returns (uint _baseTokenPrice)
    {
        // baseTokenPrice = closeAmount * (buyOrderBaseTokenAmount / buyOrderUnderlyingTokenAmount)
        uint baseTokenPrice = getPartialAmount(
            orderValues[1],
            orderValues[0],
            closeAmount
        );

        // We need to have enough base token locked in the the close's vault to pay
        // for both the buyback and the interest fee
        require(
            add(baseTokenPrice, interestFee) <= Vault(VAULT).balances(closeId, short.baseToken)
        );

        return baseTokenPrice;
    }

    function transferFeeForBuyback(
        bytes32 closeId,
        uint[6] orderValues,
        address takerFeeToken,
        uint baseTokenPrice
    )
        internal
    {
        // takerFee = buyOrderTakerFee * (baseTokenPrice / buyOrderBaseTokenAmount)
        uint takerFee = getPartialAmount(
            baseTokenPrice,
            orderValues[1],
            orderValues[3]
        );

        // Transfer taker fee for buyback
        if (takerFee > 0) {
            Vault(VAULT).transfer(
                closeId,
                takerFeeToken,
                msg.sender,
                takerFee
            );
        }
    }

    function sendTokensOnClose(
        Short short,
        bytes32 closeId,
        uint closeAmount,
        uint interestFee
    )
        internal
        returns (uint _sellerBaseTokenAmount)
    {
        Vault vault = Vault(VAULT);

        // Send original loaned underlying token to lender
        vault.send(
            closeId,
            short.underlyingToken,
            short.lender,
            closeAmount
        );

        // Send base token interest fee to lender
        if (interestFee > 0) {
            vault.send(
                closeId,
                short.baseToken,
                short.lender,
                interestFee
            );
        }

        // Send remaining base token to seller (= deposit + profit - interestFee)
        uint sellerBaseTokenAmount = vault.balances(closeId, short.baseToken);
        vault.send(
            closeId,
            short.baseToken,
            short.seller,
            sellerBaseTokenAmount
        );

        // Should now hold no balance of base or underlying token
        assert(vault.balances(closeId, short.underlyingToken) == 0);
        assert(vault.balances(closeId, short.baseToken) == 0);

        return sellerBaseTokenAmount;
    }

    function logEventOnClose(
        CloseShortTx transaction,
        uint interestFee,
        uint buybackCost,
        uint sellerBaseTokenAmount
    )
        internal
    {
        if (transaction.closeAmount == transaction.currentShortAmount) {
            ShortClosed(
                transaction.shortId,
                transaction.closeAmount,
                interestFee,
                sellerBaseTokenAmount,
                buybackCost,
                block.timestamp
            );
        } else {
            ShortPartiallyClosed(
                transaction.shortId,
                transaction.closeAmount,
                sub(transaction.currentShortAmount, transaction.closeAmount),
                interestFee,
                sellerBaseTokenAmount,
                buybackCost,
                block.timestamp
            );
        }
    }

    function cleanupShort(
        bytes32 shortId
    )
        internal
    {
        ShortSellRepo(REPO).deleteShort(shortId);
    }

    // ----- forceRecoverLoan Internal Functions -----

    function sendTokensOnForceRecover(
        Short short,
        bytes32 shortId,
        uint offer,
        address bidder,
        bool hasCurrentOffer
    )
        internal
        returns (
            uint _lenderBaseTokenAmount,
            uint _buybackCost
        )
    {
        Vault vault = Vault(VAULT);

        if (!hasCurrentOffer) {
            // If there is no auction bid to sell back the underlying token owed to the lender
            // then give the lender everything locked in the position
            vault.send(
                shortId,
                short.baseToken,
                short.lender,
                vault.balances(shortId, short.baseToken)
            );

            return (0, 0);
        } else {
            return sendTokensOnForceRecoverWithAuctionBid(
                short,
                shortId,
                offer,
                bidder
            );
        }
    }

    function sendTokensOnForceRecoverWithAuctionBid(
        Short short,
        bytes32 shortId,
        uint offer,
        address bidder
    )
        internal
        returns (
            uint _lenderBaseTokenAmount,
            uint _buybackCost
        )
    {
        uint currentShortAmount = sub(short.shortAmount, short.closedAmount);
        bytes32 auctionVaultId = getAuctionVaultId(shortId);

        // Send the lender underlying tokens + interest fee
        uint lenderBaseTokenAmount = sendToLenderOnForceCloseWithAuctionBid(
            short,
            shortId,
            currentShortAmount,
            auctionVaultId
        );

        // Send the auction bidder any leftover underlying token, and base token proportional
        // to what he bid
        uint buybackCost = sendToBidderOnForceCloseWithAuctionBid(
            short,
            shortId,
            currentShortAmount,
            bidder,
            offer,
            auctionVaultId
        );

        // Send the short seller whatever is left
        sendToShortSellerOnForceCloseWithAuctionBid(
            short,
            shortId
        );

        return (lenderBaseTokenAmount, buybackCost);
    }

    function sendToLenderOnForceCloseWithAuctionBid(
        Short short,
        bytes32 shortId,
        uint currentShortAmount,
        bytes32 auctionVaultId
    )
        internal
        returns (uint _lenderBaseTokenAmount)
    {
        Vault vault = Vault(VAULT);

        // If there is an auction bid to sell back the underlying token owed to the lender
        // then give the lender just the owed interest fee at the end of the call time
        uint lenderBaseTokenAmount = calculateInterestFee(
            short,
            currentShortAmount,
            add(short.callTimestamp, short.callTimeLimit)
        );

        vault.send(
            shortId,
            short.baseToken,
            short.lender,
            lenderBaseTokenAmount
        );

        // Send the lender back the borrowed tokens (out of the auction vault)

        vault.send(
            auctionVaultId,
            short.underlyingToken,
            short.lender,
            currentShortAmount
        );

        return lenderBaseTokenAmount;
    }

    function sendToBidderOnForceCloseWithAuctionBid(
        Short short,
        bytes32 shortId,
        uint currentShortAmount,
        address bidder,
        uint offer,
        bytes32 auctionVaultId
    )
        internal
        returns (uint _buybackCost)
    {
        Vault vault = Vault(VAULT);

        // If there is extra underlying token leftover, send it back to the bidder
        uint remainingAuctionVaultBalance = vault.balances(
            auctionVaultId, short.underlyingToken
        );

        if (remainingAuctionVaultBalance > 0) {
            vault.send(
                auctionVaultId,
                short.underlyingToken,
                bidder,
                remainingAuctionVaultBalance
            );
        }

        // Send the bidder the bidded amount of base token
        uint auctionAmount = getPartialAmount(
            currentShortAmount,
            short.shortAmount,
            offer
        );

        vault.send(
            shortId,
            short.baseToken,
            bidder,
            auctionAmount
        );

        return auctionAmount;
    }

    function sendToShortSellerOnForceCloseWithAuctionBid(
        Short short,
        bytes32 shortId
    )
        internal
    {
        Vault vault = Vault(VAULT);

        // Send the short seller whatever is left
        // (== margin deposit + interest fee - bid offer)
        vault.send(
            shortId,
            short.baseToken,
            short.seller,
            vault.balances(shortId, short.baseToken)
        );
    }

    function payBackAuctionBidderIfExists(
        bytes32 shortId,
        Short short
    )
        internal
    {
        var (, currentBidder, hasCurrentOffer) = getShortAuctionOffer(shortId);

        if (!hasCurrentOffer) {
            return;
        }

        ShortSellAuctionRepo(AUCTION_REPO).deleteAuctionOffer(shortId);

        Vault(VAULT).send(
            shortId,
            short.underlyingToken,
            currentBidder,
            Vault(VAULT).balances(getAuctionVaultId(shortId), short.underlyingToken)
        );
    }

    function getAuctionVaultId(
        bytes32 shortId
    )
        internal
        pure
        returns (bytes32 _auctionVaultId)
    {
        return keccak256(shortId, "AUCTION_VAULT");
    }

    // -------- Parsing Functions -------

    function parseShortTx(
        address[12] addresses,
        uint[17] values,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        view
        returns (ShortTx _transaction)
    {
        ShortTx memory transaction = ShortTx({
            underlyingToken: addresses[0],
            baseToken: addresses[1],
            shortAmount: values[15],
            depositAmount: values[16],
            loanOffering: parseLoanOffering(
                addresses,
                values,
                values32,
                sigV,
                sigRS
            ),
            buyOrder: parseBuyOrder(
                addresses,
                values,
                sigV,
                sigRS
            )
        });

        return transaction;
    }

    function parseLoanOffering(
        address[12] addresses,
        uint[17] values,
        uint32[2] values32,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        view
        returns (LoanOffering _loanOffering)
    {
        LoanOffering memory loanOffering = LoanOffering({
            lender: addresses[2],
            taker: addresses[3],
            feeRecipient: addresses[4],
            lenderFeeToken: addresses[5],
            takerFeeToken: addresses[6],
            rates: parseLoanOfferRates(values),
            expirationTimestamp: values[7],
            lockoutTime: values32[0],
            callTimeLimit: values32[1],
            salt: values[8],
            loanHash: 0,
            signature: parseLoanOfferingSignature(sigV, sigRS)
        });

        loanOffering.loanHash = getLoanOfferingHash(
            loanOffering,
            addresses[1],
            addresses[0]
        );

        return loanOffering;
    }

    function parseLoanOfferRates(
        uint[17] values
    )
        internal
        pure
        returns (LoanRates _loanRates)
    {
        LoanRates memory rates = LoanRates({
            minimumDeposit: values[0],
            maxAmount: values[1],
            minAmount: values[2],
            minimumSellAmount: values[3],
            interestRate: values[4],
            lenderFee: values[5],
            takerFee: values[6]
        });

        return rates;
    }

    function parseLoanOfferingSignature(
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        pure
        returns (Signature _signature)
    {
        Signature memory signature = Signature({
            v: sigV[0],
            r: sigRS[0],
            s: sigRS[1]
        });

        return signature;
    }

    function parseLoanOffering(
        address[7] addresses,
        uint[9] values,
        uint32[2] values32
    )
        internal
        view
        returns (LoanOffering _loanOffering)
    {
        LoanOffering memory loanOffering = LoanOffering({
            lender: addresses[2],
            taker: addresses[3],
            feeRecipient: addresses[4],
            lenderFeeToken: addresses[5],
            takerFeeToken: addresses[6],
            rates: parseLoanOfferRates(values),
            expirationTimestamp: values[7],
            lockoutTime: values32[0],
            callTimeLimit: values32[1],
            salt: values[8],
            loanHash: 0,
            signature: Signature({
                v: 0,
                r: "0x",
                s: "0x"
            })
        });

        loanOffering.loanHash = getLoanOfferingHash(
            loanOffering,
            addresses[1],
            addresses[0]
        );

        return loanOffering;
    }

    function parseLoanOfferRates(
        uint[9] values
    )
        internal
        pure
        returns (LoanRates _loanRates)
    {
        LoanRates memory rates = LoanRates({
            minimumDeposit: values[0],
            maxAmount: values[1],
            minAmount: values[2],
            minimumSellAmount: values[3],
            interestRate: values[4],
            lenderFee: values[5],
            takerFee: values[6]
        });

        return rates;
    }

    function parseBuyOrder(
        address[12] addresses,
        uint[17] values,
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        pure
        returns (BuyOrder _buyOrder)
    {
        BuyOrder memory order = BuyOrder({
            maker: addresses[7],
            taker: addresses[8],
            feeRecipient: addresses[9],
            makerFeeToken: addresses[10],
            takerFeeToken: addresses[11],
            baseTokenAmount: values[9],
            underlyingTokenAmount: values[10],
            makerFee: values[11],
            takerFee: values[12],
            expirationTimestamp: values[13],
            salt: values[14],
            signature: parseBuyOrderSignature(sigV, sigRS)
        });

        return order;
    }

    function parseBuyOrderSignature(
        uint8[2] sigV,
        bytes32[4] sigRS
    )
        internal
        pure
        returns (Signature _signature)
    {
        Signature memory signature = Signature({
            v: sigV[1],
            r: sigRS[2],
            s: sigRS[3]
        });

        return signature;
    }

    function parseCloseShortTx(
        bytes32 shortId,
        uint closeAmount,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    )
        internal
        view
        returns (CloseShortTx _tx)
    {
        Short memory short = getShortObject(shortId);
        return CloseShortTx({
            short: short,
            currentShortAmount: sub(short.shortAmount, short.closedAmount),
            shortId: shortId,
            closeAmount: closeAmount,
            orderAddresses: orderAddresses,
            orderValues: orderValues,
            orderV: orderV,
            orderR: orderR,
            orderS: orderS
        });
    }

    function getShortObject(
        bytes32 shortId
    )
        internal
        view
        returns (Short _short)
    {
        var (
            underlyingToken,
            baseToken,
            shortAmount,
            closedAmount,
            interestRate,
            callTimeLimit,
            lockoutTime,
            startTimestamp,
            callTimestamp,
            lender,
            seller
        ) =  ShortSellRepo(REPO).getShort(shortId);

        // This checks that the short exists
        require(startTimestamp != 0);

        return Short({
            underlyingToken: underlyingToken,
            baseToken: baseToken,
            shortAmount: shortAmount,
            closedAmount: closedAmount,
            interestRate: interestRate,
            callTimeLimit: callTimeLimit,
            lockoutTime: lockoutTime,
            startTimestamp: startTimestamp,
            callTimestamp: callTimestamp,
            lender: lender,
            seller: seller
        });
    }
}
