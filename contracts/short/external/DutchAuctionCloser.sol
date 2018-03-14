pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { ShortCustodian } from "./interfaces/ShortCustodian.sol";
import { ShortSell } from "../ShortSell.sol";
import { ShortSellCommon } from "../impl/ShortSellCommon.sol";
import { ShortSellHelper } from "./lib/ShortSellHelper.sol";


/**
 * @title DutchAuctionCloser
 * @author dYdX
 */
 /* solium-disable-next-line */
contract DutchAuctionCloser is
    ReentrancyGuard {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short was closed by this contract
     */
    event ShortClosedByDutchAuction(
        bytes32 indexed shortId,
        address indexed shortSeller,
        address indexed bidder,
        uint256 closeAmount,
        uint256 baseTokenForBidder,
        uint256 baseTokenForSeller
    );

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct DutchBidTx {
        uint256 auctionPrice;
        uint256 closeAmount;
    }

    // -----------------------------
    // ------ State Variables ------
    // -----------------------------

    // Address of the dYdX ShortSell contract
    address public SHORT_SELL;

    // Address of the dYdX ShortSell contract
    address public PROXY;

    // Numerator of the fraction of the callTimeLimit allocated to the auction
    uint256 public callTimeLimitNumerator;

    // Denominator of the fraction of the callTimeLimit allocated to the auction
    uint256 public callTimeLimitDenominator;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function DutchAuctionCloser(
        address _shortSell,
        uint256 _callTimeLimitNumerator,
        uint256 _callTimeLimitDenominator
    )
        public
    {
        // these two requirements also require (_denominator > 0)
        require(_callTimeLimitNumerator <= _callTimeLimitNumerator);
        require(_callTimeLimitNumerator > 0);
        callTimeLimitNumerator = _callTimeLimitNumerator;
        callTimeLimitDenominator = _callTimeLimitDenominator;

        SHORT_SELL = _shortSell;
        PROXY = ShortSell(_shortSell).PROXY();
    }

    // ----------------------------------------
    // ---- Public State Chaning functions ----
    // ----------------------------------------

    /**
     * Allows anyone to close a called short, Dutch-Auction style. The short must be past half of
     * its callTimeLimit and the paid price of the underlyingTokens starts at 0 at that point and
     * linearly increases to the amount of baseToken in the vault for the shortId. The short-seller
     * will be granted the difference between the price and the total baseToken in the vault.
     *
     * @param  shortId                Unique ID of the short
     * @param  requestedCloseAmount   Amount of the short the bidder is attempting to close
     * @param  minimumAcceptedPayout  Minimum accepted amount of baseToken the msg.sender is willing
     *                                to accept for the entire requestedCloseAmount
     * @return tuple:
     *         1) Amount of the short that was closed
     *         2) Amount of baseToken that the auction bidder recieved for closing the short
     */
    function closeShortDirectly(
        bytes32 shortId,
        uint256 requestedCloseAmount,
        uint256 minimumAcceptedPayout
    )
        nonReentrant
        external
        returns (
            uint256 _amountClosed,
            uint256 _baseTokenReceived
        )
    {
        return closeShortImpl(
            shortId,
            requestedCloseAmount,
            minimumAcceptedPayout,
            address(0),
            new bytes(0)
        );
    }

    /**
     * Allows anyone to close a called short, Dutch-Auction style. The short must be past half of
     * its callTimeLimit and the paid price of the underlyingTokens starts at 0 at that point and
     * linearly increases to the amount of baseToken in the vault for the shortId. The short-seller
     * will be granted the difference between the price and the total baseToken in the vault.
     *
     * @param  shortId                Unique ID of the short
     * @param  requestedCloseAmount   Amount of the short the bidder is attempting to close
     * @param  minimumAcceptedPayout  Minimum accepted amount of baseToken the msg.sender is willing
     *                                to accept for the entire requestedCloseAmount after baseToken
     *                                is paid to the exchangeWrapper to execute the order given.
     * @param  exchangeWrapper        Address of an exchange exchangeWrapper
     * @param  order                  Order object to be passed to the exchange wrapper
     * @return tuple:
     *         1) Amount of the short that was closed
     *         2) Amount of baseToken that the auction bidder recieved for closing the short
     */
    function closeShort(
        bytes32 shortId,
        uint256 requestedCloseAmount,
        uint256 minimumAcceptedPayout,
        address exchangeWrapper,
        bytes  order
    )
        nonReentrant
        external
        returns (
            uint256 _amountClosed,
            uint256 _baseTokenReceived
        )
    {
        return closeShortImpl(
            shortId,
            requestedCloseAmount,
            minimumAcceptedPayout,
            exchangeWrapper,
            order
        );
    }

    // -----------------------------------
    // ---- Internal Helper functions ----
    // -----------------------------------

    function closeShortImpl(
        bytes32 shortId,
        uint256 requestedCloseAmount,
        uint256 minimumAcceptedPayout,
        address exchangeWrapper,
        bytes memory order
    )
        internal
        returns (
            uint256 _amountClosed,
            uint256 _baseTokenReceived
        )
    {
        // get short
        ShortSellCommon.Short memory short = ShortSellHelper.getShort(SHORT_SELL, shortId);

        // get deedHolder ASAP; the state of short.seller may change upon closing the short
        address deedHolder = ShortCustodian(short.seller).getShortSellDeedHolder(shortId);

        // validate auction timing and get auction price
        DutchBidTx memory bidTx = calculateBid(
            shortId,
            short,
            requestedCloseAmount);

        // take tokens from msg.sender and close the short
        uint256 baseTokenReceived = shortSellCloseShort(
            shortId,
            short,
            bidTx,
            exchangeWrapper,
            order
        );

        // pay baseToken back to short owner
        TokenInteract.transfer(short.baseToken, deedHolder, bidTx.auctionPrice);

        // pay baseToken to the auction bidder
        uint256 proratedMinAcceptedPayout = MathHelpers.getPartialAmount(
            bidTx.closeAmount,
            requestedCloseAmount,
            minimumAcceptedPayout
        );
        uint256 bidderReward = baseTokenReceived.sub(bidTx.auctionPrice);
        require(bidderReward >= proratedMinAcceptedPayout);
        if (bidderReward > 0) {
            TokenInteract.transfer(short.baseToken, msg.sender, bidderReward);
        }

        ShortClosedByDutchAuction(
            shortId,
            short.seller,
            msg.sender,
            bidTx.closeAmount,
            bidderReward,
            bidTx.auctionPrice
        );

        return (bidTx.closeAmount, bidderReward);
    }

    function shortSellCloseShort(
        bytes32 shortId,
        ShortSellCommon.Short memory short,
        DutchBidTx memory closeTx,
        address exchangeWrapper,
        bytes memory order
    )
        internal
        returns (uint256 _baseTokenReceived)
    {
        // remember how much baseToken this contract has before the short is taken out
        uint256 initialBaseToken = TokenInteract.balanceOf(short.baseToken, address(this));

        // if closing short directly, take tokens from msg.sender and approve of the proxy
        if (exchangeWrapper == address(0)) {
            TokenInteract.transferFrom(
                short.underlyingToken,
                msg.sender,
                address(this),
                closeTx.closeAmount);
            TokenInteract.approve(short.underlyingToken, PROXY, closeTx.closeAmount);
        }

        // close the short
        uint256 amountClosed;
        uint256 baseTokenReceived;
        (amountClosed, baseTokenReceived, /*interestFeeAmount*/) =
            ShortSell(SHORT_SELL).closeShort(
                shortId,
                closeTx.closeAmount,
                exchangeWrapper,
                order
            );

        // validate that the close went through as expected
        assert(closeTx.closeAmount == amountClosed);
        uint256 finalBaseToken = TokenInteract.balanceOf(short.baseToken, address(this));
        assert(finalBaseToken.sub(initialBaseToken) == baseTokenReceived);

        return baseTokenReceived;
    }

    function calculateBid(
        bytes32 shortId,
        ShortSellCommon.Short memory short,
        uint256 requestedCloseAmount
    )
        view
        internal
        returns (DutchBidTx memory _bidTx)
    {
        uint256 maxCloseAmount = short.shortAmount.sub(short.closedAmount);
        uint256 closeAmount = Math.min256(requestedCloseAmount, maxCloseAmount);

        uint256 auctionStartTimestamp;
        uint256 auctionEndTimestamp;
        (auctionStartTimestamp, auctionEndTimestamp) = getAuctionTimeLimits(short);

        uint256 availableBaseTokenAmount = MathHelpers.getPartialAmount(
            closeAmount,
            maxCloseAmount,
            getAvailableBaseToken(shortId));

        // linearly increases from zero to availableBaseTokenAmount over the course of the auction
        uint256 bidderReward = MathHelpers.getPartialAmount(
            block.timestamp.sub(auctionStartTimestamp), // time since auction start
            auctionEndTimestamp.sub(auctionStartTimestamp), // total auction length
            availableBaseTokenAmount
        );
        uint256 auctionPrice = availableBaseTokenAmount.sub(bidderReward);

        return DutchBidTx({
            auctionPrice: auctionPrice,
            closeAmount: closeAmount
        });
    }

    function getAuctionTimeLimits(
        ShortSellCommon.Short memory short
    )
        view
        internal
        returns (
            uint256 auctionStartTimestamp,
            uint256 auctionEndTimestamp
        )
    {
        uint256 maxTimestamp = uint256(short.startTimestamp).add(short.maxDuration);
        uint256 callTimestamp = uint256(short.callTimestamp);
        uint256 callTimeLimit = uint256(short.callTimeLimit);

        uint256 auctionLength = MathHelpers.getPartialAmount(
            callTimeLimitNumerator,
            callTimeLimitDenominator,
            callTimeLimit);

        if (callTimestamp == 0 || callTimestamp > maxTimestamp.sub(callTimeLimit)) {
            // auction time determined by maxTimestamp
            auctionStartTimestamp = Math.max256(
                uint256(short.startTimestamp),
                maxTimestamp.sub(auctionLength));
            auctionEndTimestamp = maxTimestamp;
        } else {
            // auction time determined by callTimestamp
            auctionStartTimestamp = callTimestamp.add(callTimeLimit).sub(auctionLength);
            auctionEndTimestamp = callTimestamp.add(callTimeLimit);
        }

        require(block.timestamp >= auctionStartTimestamp);
        require(block.timestamp <= auctionEndTimestamp);
    }

    function getAvailableBaseToken(
        bytes32 shortId
    )
        view
        internal
        returns (uint256 _availableBaseTokenAmount)
    {
        uint256 vaultBaseToken = ShortSell(SHORT_SELL).getShortBalance(shortId);
        uint256 shortInterestFee = ShortSell(SHORT_SELL).getShortInterestFee(shortId);
        return vaultBaseToken.sub(shortInterestFee);
    }
}
