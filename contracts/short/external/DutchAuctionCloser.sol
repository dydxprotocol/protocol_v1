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
        uint256 bidderReward;
        uint256 closeAmount;
    }

    // -----------------------------
    // ------ State Variables ------
    // -----------------------------

    // Address of the dYdX ShortSell contract
    address public SHORT_SELL;

    // Numerator of the fraction of the callTimeLimit allocated to the auction
    uint256 public numerator;

    // Denominator of the fraction of the callTimeLimit allocated to the auction
    uint256 public denominator;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function DutchAuctionCloser(
        address _shortSell,
        uint256 _numerator,
        uint256 _denominator
    )
        public
    {
        // these two requirements also require (_denominator > 0)
        require(_numerator <= _denominator);
        require(_numerator > 0);

        SHORT_SELL = _shortSell;
        numerator = _numerator;
        denominator = _denominator;
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
     *                                to accept for the entire requestedCloseAmount.
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
        // get short
        ShortSellCommon.Short memory short = ShortSellHelper.getShort(SHORT_SELL, shortId);

        // validate auction timing and get bidderReward
        DutchBidTx memory bidTx = calculateBid(
            shortId,
            short,
            requestedCloseAmount);

        // validate that minimumAcceptedPayout is respected
        uint256 proratedMinAcceptedPayout = MathHelpers.getPartialAmount(
            bidTx.closeAmount,
            requestedCloseAmount,
            minimumAcceptedPayout
        );
        require(bidTx.bidderReward >= proratedMinAcceptedPayout);

        // take tokens from msg.sender and close the short
        uint256 baseTokenReceived = closeShortInternal(
            shortId,
            short,
            bidTx
        );

        // pay baseToken back to short owner
        address deedHolder = ShortCustodian(short.seller).getShortSellDeedHolder(shortId);
        uint256 baseTokenForShortOwner = baseTokenReceived.sub(bidTx.bidderReward);
        TokenInteract.transfer(short.baseToken, deedHolder, baseTokenForShortOwner);

        // pay baseToken to the auction bidder
        TokenInteract.transfer(short.baseToken, msg.sender, bidTx.bidderReward);

        ShortClosedByDutchAuction(
            shortId,
            short.seller,
            msg.sender,
            bidTx.closeAmount,
            bidTx.bidderReward,
            baseTokenForShortOwner
        );

        return (bidTx.closeAmount, bidTx.bidderReward);
    }

    // -----------------------------------
    // ---- Internal Helper functions ----
    // -----------------------------------

    function closeShortInternal(
        bytes32 shortId,
        ShortSellCommon.Short memory short,
        DutchBidTx memory closeTx
    )
        internal
        returns (uint256 _baseTokenReceived)
    {
        // remember how much baseToken this contract has before the short is taken out
        uint256 initialBaseToken = TokenInteract.balanceOf(short.baseToken, address(this));

        // take the underlying token from the msg.sender
        TokenInteract.transferFrom(
            short.underlyingToken,
            msg.sender,
            address(this),
            closeTx.closeAmount);

        // close the short directly using the underlying token
        uint256 amountClosed;
        uint256 baseTokenReceived;
        (amountClosed, baseTokenReceived, /*interestFeeAmount*/) = ShortSell(SHORT_SELL).closeShort(
            shortId,
            closeTx.closeAmount,
            address(0), // no exchange wrapper
            new bytes(0) // no order bytes
        );

        uint256 finalBaseToken = TokenInteract.balanceOf(short.baseToken, address(this));

        // check receipt of the correct amount of baseToken
        assert(closeTx.bidderReward <= baseTokenReceived);
        assert(closeTx.closeAmount == amountClosed);
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

        return DutchBidTx({
            bidderReward: bidderReward,
            closeAmount: closeAmount
        });
    }

    function getAuctionTimeLimits(
        ShortSellCommon.Short memory short
    )
        view
        internal
        returns (
            uint256 _auctionStartTimestamp,
            uint256 _auctionEndTimestamp
        )
    {
        uint256 maxTimestamp = uint256(short.startTimestamp).add(short.maxDuration);
        uint256 callTimestamp = uint256(short.callTimestamp);
        uint256 callTimeLimit = uint256(short.callTimeLimit);

        uint256 auctionLength = callTimeLimit.mul(numerator).div(denominator);

        uint256 auctionStartTimestamp;
        uint256 auctionEndTimestamp;
        if (callTimestamp == 0 || callTimestamp > maxTimestamp.sub(auctionLength)) {
            // auction time determined by maxTimestamp
            auctionStartTimestamp = Math.max256(
                uint256(short.startTimestamp),
                maxTimestamp.sub(auctionLength));
            auctionEndTimestamp = maxTimestamp;
        } else {
            // auction time determined by callTimestamp
            auctionStartTimestamp = callTimestamp;
            auctionEndTimestamp = callTimestamp.add(auctionLength);
        }

        require(block.timestamp >= auctionStartTimestamp);
        require(block.timestamp <= auctionEndTimestamp);
        return (auctionStartTimestamp, auctionEndTimestamp);
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
