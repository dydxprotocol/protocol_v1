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
import { PayoutRecipient } from "../interfaces/PayoutRecipient.sol";


/**
 * @title DutchAuctionCloser
 * @author dYdX
 */
 /* solium-disable-next-line */
contract DutchAuctionCloser is
    PayoutRecipient,
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

    // Numerator of the fraction of the callTimeLimit allocated to the auction
    uint256 public CALL_TIMELIMIT_NUMERATOR;

    // Denominator of the fraction of the callTimeLimit allocated to the auction
    uint256 public CALL_TIMELIMIT_DENOMINATOR;

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function DutchAuctionCloser(
        address shortSell,
        uint256 callTimeLimitNumerator,
        uint256 callTimeLimitDenominator
    )
        public
        PayoutRecipient(shortSell)
    {
        // these two requirements also require (_denominator > 0)
        require(callTimeLimitNumerator <= callTimeLimitDenominator);
        require(callTimeLimitNumerator > 0);
        CALL_TIMELIMIT_NUMERATOR = callTimeLimitNumerator;
        CALL_TIMELIMIT_DENOMINATOR = callTimeLimitDenominator;
    }

    // ----------------------------------------
    // ---- Public State Chaning functions ----
    // ----------------------------------------

    /**
     * Function to implement the PayoutRecipient interface.
     *
     * @param  shortId          Id of the short
     * @param  closeAmount      Amount of the short that was closed
     * @param  shortCloser      Address of the account or contract that closed the short
     * @param  shortSeller      Address of the owner of the short
     * @param  baseToken        Address of the ERC20 base token
     * @param  payoutBaseToken  Number of base tokens received from the payout
     * @param  totalBaseToken   Total number of base tokens removed from vault during close
     */
    function receiveCloseShortPayout(
        bytes32 shortId,
        uint256 closeAmount,
        address shortCloser,
        address shortSeller,
        address baseToken,
        uint256 payoutBaseToken,
        uint256 totalBaseToken
    )
        onlyShortSell
        external
    {
        uint256 auctionStartTimestamp;
        uint256 auctionEndTimestamp;
        (auctionStartTimestamp, auctionEndTimestamp) = getAuctionTimeLimits(shortId);

        // linearly decreases from maximum amount to zero over the course of the auction
        uint256 auctionPrice = MathHelpers.getPartialAmount(
            auctionEndTimestamp.sub(block.timestamp),
            auctionEndTimestamp.sub(auctionStartTimestamp),
            totalBaseToken
        );

        // pay baseToken back to short owner
        address deedHolder = ShortCustodian(shortSeller).getShortSellDeedHolder(shortId);
        TokenInteract.transfer(baseToken, deedHolder, auctionPrice);

        // pay baseToken back to short closer
        uint256 bidderReward = payoutBaseToken.sub(auctionPrice);
        TokenInteract.transfer(baseToken, shortCloser, bidderReward);

        ShortClosedByDutchAuction(
            shortId,
            shortSeller,
            shortCloser,
            closeAmount,
            bidderReward,
            auctionPrice
        );
    }

    // -----------------------------------
    // ---- Internal Helper functions ----
    // -----------------------------------

    function getAuctionTimeLimits(
        bytes32 shortId
    )
        view
        internal
        returns (
            uint256 auctionStartTimestamp,
            uint256 auctionEndTimestamp
        )
    {
        ShortSellCommon.Short memory short = ShortSellHelper.getShort(SHORT_SELL, shortId);

        uint256 maxTimestamp = uint256(short.startTimestamp).add(short.maxDuration);
        uint256 callTimestamp = uint256(short.callTimestamp);
        uint256 callTimeLimit = uint256(short.callTimeLimit);

        uint256 auctionLength = MathHelpers.getPartialAmount(
            CALL_TIMELIMIT_NUMERATOR,
            CALL_TIMELIMIT_DENOMINATOR,
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
}
