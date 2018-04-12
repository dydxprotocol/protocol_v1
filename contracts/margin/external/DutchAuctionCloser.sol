pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { MarginCommon } from "../impl/MarginCommon.sol";
import { PayoutRecipient } from "../interfaces/PayoutRecipient.sol";
import { TraderCustodian } from "./interfaces/TraderCustodian.sol";
import { MarginHelper } from "./lib/MarginHelper.sol";


/**
 * @title DutchAuctionCloser
 * @author dYdX
 *
 * Contract for allowing anyone to close a margin-called position by using a Dutch auction mechanism
 * to give a fair price to the margin trader. Price paid to the margin trader decreases linearly
 * over time.
 */
 /* solium-disable-next-line */
contract DutchAuctionCloser is
    PayoutRecipient {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A position was closed by this contract
     */
    event PositionClosedByDutchAuction(
        bytes32 indexed marginId,
        address indexed positionOwner,
        address indexed bidder,
        uint256 closeAmount,
        uint256 quoteTokenForBidder,
        uint256 quoteTokenForTrader
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

    // Numerator of the fraction of the callTimeLimit allocated to the auction
    uint256 public CALL_TIMELIMIT_NUMERATOR;

    // Denominator of the fraction of the callTimeLimit allocated to the auction
    uint256 public CALL_TIMELIMIT_DENOMINATOR;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function DutchAuctionCloser(
        address margin,
        uint256 callTimeLimitNumerator,
        uint256 callTimeLimitDenominator
    )
        public
        PayoutRecipient(margin)
    {
        // these two requirements also require (_denominator > 0)
        require(callTimeLimitNumerator <= callTimeLimitDenominator);
        require(callTimeLimitNumerator > 0);
        CALL_TIMELIMIT_NUMERATOR = callTimeLimitNumerator;
        CALL_TIMELIMIT_DENOMINATOR = callTimeLimitDenominator;
    }

    // -------------------------------------------------
    // ---- Margin-Only State-Changing Functions ----
    // -------------------------------------------------

    /**
     * Function to implement the PayoutRecipient interface.
     *
     * @param  marginId          Unique ID of the margin position
     * @param  closeAmount       Amount of the margin position that was closed
     * @param  positionCloser    Address of the account or contract that closed the position
     * @param  positionOwner     Address of the owner of the margin position
     * @param  quoteToken        Address of the ERC20 quote token
     * @param  payoutQuoteToken  Number of quote tokens received from the payout
     * @param  totalQuoteToken   Total number of quote tokens removed from vault during close
     * @return                   True if approved by the reciever
     */
    function receiveClosePositionPayout(
        bytes32 marginId,
        uint256 closeAmount,
        address positionCloser,
        address positionOwner,
        address quoteToken,
        uint256 payoutQuoteToken,
        uint256 totalQuoteToken
    )
        onlyMargin
        external
        returns (bool)
    {
        uint256 auctionStartTimestamp;
        uint256 auctionEndTimestamp;
        (auctionStartTimestamp, auctionEndTimestamp) = getAuctionTimeLimits(marginId);

        // linearly decreases from maximum amount to zero over the course of the auction
        uint256 auctionPrice = MathHelpers.getPartialAmount(
            auctionEndTimestamp.sub(block.timestamp),
            auctionEndTimestamp.sub(auctionStartTimestamp),
            totalQuoteToken
        );

        // pay quoteToken back to trader
        address deedHolder = TraderCustodian(positionOwner).getPositionDeedHolder(marginId);
        TokenInteract.transfer(quoteToken, deedHolder, auctionPrice);

        // pay quoteToken back to auction bidder
        uint256 bidderReward = payoutQuoteToken.sub(auctionPrice);
        TokenInteract.transfer(quoteToken, positionCloser, bidderReward);

        emit PositionClosedByDutchAuction(
            marginId,
            positionOwner,
            positionCloser,
            closeAmount,
            bidderReward,
            auctionPrice
        );

        return true;
    }

    // -----------------------------------
    // ---- Internal Helper functions ----
    // -----------------------------------

    function getAuctionTimeLimits(
        bytes32 marginId
    )
        view
        internal
        returns (
            uint256 auctionStartTimestamp,
            uint256 auctionEndTimestamp
        )
    {
        MarginCommon.Position memory position = MarginHelper.getPosition(MARGIN, marginId);

        uint256 maxTimestamp = uint256(position.startTimestamp).add(position.maxDuration);
        uint256 callTimestamp = uint256(position.callTimestamp);
        uint256 callTimeLimit = uint256(position.callTimeLimit);

        uint256 auctionLength = MathHelpers.getPartialAmount(
            CALL_TIMELIMIT_NUMERATOR,
            CALL_TIMELIMIT_DENOMINATOR,
            callTimeLimit);

        if (callTimestamp == 0 || callTimestamp > maxTimestamp.sub(callTimeLimit)) {
            // auction time determined by maxTimestamp
            auctionStartTimestamp = Math.max256(
                uint256(position.startTimestamp),
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
}
