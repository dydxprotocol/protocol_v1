pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/ownership/NoOwner.sol";
import "zeppelin-solidity/contracts/ownership/Ownable.sol";
import "../lib/DelayedUpdate.sol";
import "impl/ShortSellState.sol";
import "impl/ShortSellEvents.sol";
import "impl/ShortSellAdmin.sol";
import "impl/ShortImpl.sol";


/**
 * @title ShortSell
 * @author Antonio Juliano
 *
 * This contract is used to facilitate short selling as per the dYdX short sell protocol
 */
contract ShortSell is
    ShortSellState,
    ShortSellAdmin,
    ShortImpl,
    Ownable,
    DelayedUpdate,
    NoOwner,
    ReentrancyGuard {

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
        returns(bytes32 _shortId)
    {
        return shortImpl(
            addresses,
            values256,
            values32,
            sigV,
            sigRS
        );
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
        external
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        return closeShortImpl(
            shortId,
            closeAmount,
            orderAddresses,
            orderValues,
            orderV,
            orderR,
            orderS
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
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        return closeEntireShortImpl(
            shortId,
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
}
