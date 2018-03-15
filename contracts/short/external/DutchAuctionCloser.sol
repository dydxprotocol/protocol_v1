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
        PayoutRecipient(_shortSell)
    {
        // these two requirements also require (_denominator > 0)
        require(_callTimeLimitNumerator <= _callTimeLimitNumerator);
        require(_callTimeLimitNumerator > 0);
        callTimeLimitNumerator = _callTimeLimitNumerator;
        callTimeLimitDenominator = _callTimeLimitDenominator;
    }

    // ----------------------------------------
    // ---- Public State Chaning functions ----
    // ----------------------------------------

    /**
     * Function to implement the PayoutRecipient interface.
     *
     * @param  _shortId          Id of the short
     * @param  _closeAmount      Amount of the short that was closed
     * @param  _shortCloser      Address of the account or contract that closed the short
     * @param  _shortSeller      Address of the owner of the short
     * @param  _baseToken        Address of the ERC20 base token
     * @param  _payoutBaseToken  Number of base tokens recieved from the payout
     * @param  _totalBaseToken   Total number of base tokens removed from vault during close
     */
    function recieveCloseShortPayout(
        bytes32 _shortId,
        uint256 _closeAmount,
        address _shortCloser,
        address _shortSeller,
        address _baseToken,
        uint256 _payoutBaseToken,
        uint256 _totalBaseToken
    )
        onlyShortSell
        external
    {
        // get deedHolder ASAP; the state of short.seller may change upon closing the short
        address deedHolder = ShortCustodian(_shortSeller).getShortSellDeedHolder(_shortId);

        uint256 auctionStartTimestamp;
        uint256 auctionEndTimestamp;
        (auctionStartTimestamp, auctionEndTimestamp) = getAuctionTimeLimits(_shortId);

        // linearly decreases from maximum amount to zero over the course of the auction
        uint256 auctionPrice = MathHelpers.getPartialAmount(
            auctionEndTimestamp.sub(block.timestamp), // time since auction start
            auctionEndTimestamp.sub(auctionStartTimestamp), // total auction length
            _totalBaseToken
        );

        // pay baseToken back to short owner
        TokenInteract.transfer(_baseToken, deedHolder, auctionPrice);

        // pay baseToken back to short closer
        uint256 bidderReward = _payoutBaseToken.sub(auctionPrice);
        TokenInteract.transfer(_baseToken, _shortCloser, bidderReward);

        ShortClosedByDutchAuction(
            _shortId,
            _shortSeller,
            _shortCloser,
            _closeAmount,
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
}
