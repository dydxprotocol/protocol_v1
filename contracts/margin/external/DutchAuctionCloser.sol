pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { MarginCommon } from "../impl/MarginCommon.sol";
import { PayoutRecipient } from "../interfaces/PayoutRecipient.sol";
import { PositionCustodian } from "./interfaces/PositionCustodian.sol";
import { MarginHelper } from "./lib/MarginHelper.sol";


/**
 * @title DutchAuctionCloser
 * @author dYdX
 *
 * Contract for allowing anyone to close a called-in position by using a Dutch auction mechanism to
 * give a fair price to the position owner. Price paid to the owner decreases linearly over time.
 */
contract DutchAuctionCloser is PayoutRecipient {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * A position was closed by this contract
     */
    event PositionClosedByDutchAuction(
        bytes32 indexed positionId,
        address indexed owner,
        address indexed bidder,
        uint256 closeAmount,
        uint256 heldTokenForBidder,
        uint256 heldTokenForOwner
    );

    // ============ Structs ============

    struct DutchBidTx {
        uint256 auctionPrice;
        uint256 closeAmount;
    }

    // ============ State Variables ============

    // Numerator of the fraction of the callTimeLimit allocated to the auction
    uint256 public CALL_TIMELIMIT_NUMERATOR;

    // Denominator of the fraction of the callTimeLimit allocated to the auction
    uint256 public CALL_TIMELIMIT_DENOMINATOR;

    // ============ Constructor ============

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

    // ============ Margin-Only State-Changing Functions ============

    /**
     * Function to implement the PayoutRecipient interface.
     *
     * @param  positionId         Unique ID of the position
     * @param  closeAmount        Amount of the position that was closed
     * @param  closer             Address of the account or contract that closed the position
     * @param  positionOwner      Address of the owner of the position
     * @param  heldToken          Address of the ERC20 heldToken
     * @param  payout             Amount of heldToken received from the payout
     * @param  totalHeldToken     Total amount of heldToken removed from vault during close
     * @param  payoutInHeldToken  True if payout is in heldToken, false if in owedToken
     * @return                    True if approved by the receiver
     */
    function receiveClosePositionPayout(
        bytes32 positionId,
        uint256 closeAmount,
        address closer,
        address positionOwner,
        address heldToken,
        uint256 payout,
        uint256 totalHeldToken,
        bool    payoutInHeldToken
    )
        external
        onlyMargin
        returns (bool)
    {
        require(payoutInHeldToken);

        uint256 auctionPrice = getAuctionPrice(
            positionId,
            totalHeldToken
        );

        // pay heldToken back to position owner
        address deedHolder = PositionCustodian(positionOwner).getPositionDeedHolder(positionId);
        TokenInteract.transfer(heldToken, deedHolder, auctionPrice);

        // pay heldToken back to bidder
        uint256 bidderReward = payout.sub(auctionPrice);
        TokenInteract.transfer(heldToken, closer, bidderReward);

        emit PositionClosedByDutchAuction(
            positionId,
            positionOwner,
            closer,
            closeAmount,
            bidderReward,
            auctionPrice
        );

        return true;
    }

    // ============ Internal Helper functions ============

    function getAuctionPrice(
        bytes32 positionId,
        uint256 totalHeldToken
    )
        internal
        view
        returns (uint256)
    {
        uint256 auctionStartTimestamp;
        uint256 auctionEndTimestamp;
        (auctionStartTimestamp, auctionEndTimestamp) = getAuctionTimeLimits(positionId);

        // linearly decreases from maximum amount to zero over the course of the auction
        return MathHelpers.getPartialAmount(
            auctionEndTimestamp.sub(block.timestamp),
            auctionEndTimestamp.sub(auctionStartTimestamp),
            totalHeldToken
        );
    }

    function getAuctionTimeLimits(
        bytes32 positionId
    )
        internal
        view
        returns (
            uint256 /* auctionStartTimestamp */,
            uint256 /* auctionEndTimestamp */
        )
    {
        uint256 auctionStartTimestamp;
        uint256 auctionEndTimestamp;

        MarginCommon.Position memory position = MarginHelper.getPosition(DYDX_MARGIN, positionId);

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

        return (
            auctionStartTimestamp,
            auctionEndTimestamp
        );
    }
}
