pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellAuctionRepo } from "../ShortSellAuctionRepo.sol";
import { Vault } from "../vault/Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


/**
 * @title PlaceSellbackBidImpl
 * @author dYdX
 *
 * This library contains the implementation for the placeSellbackBid function of ShortSell
 */
library PlaceSellbackBidImpl {
    using SafeMath for uint;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A bid was placed to sell back the underlying token required to close
     * a short position
     */
    event AuctionBidPlaced(
        bytes32 indexed id,
        address indexed bidder,
        uint bid,
        uint currentShortAmount
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function placeSellbackBidImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint offer
    )
        public
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        var (currentOffer, currentBidder, hasCurrentOffer) =
            ShortSellAuctionRepo(state.AUCTION_REPO).getAuction(shortId);

        uint currentShortAmount = validate(
            state,
            short,
            shortId,
            offer,
            hasCurrentOffer,
            currentOffer
        );

        // Store auction funds in a separate vault for isolation
        bytes32 auctionVaultId = ShortSellCommon.getAuctionVaultId(shortId);

        // If a previous bidder has been outbid, give them their tokens back
        if (hasCurrentOffer) {
            Vault(state.VAULT).transferToSafetyDepositBox(
                auctionVaultId,
                short.underlyingToken,
                currentBidder,
                Vault(state.VAULT).balances(auctionVaultId, short.underlyingToken)
            );
        }

        // Transfer the full underlying token amount from the bidder
        Vault(state.VAULT).transferToVault(
            auctionVaultId,
            short.underlyingToken,
            msg.sender,
            currentShortAmount
        );

        // Record that the bidder has placed this bid
        ShortSellAuctionRepo(state.AUCTION_REPO).setAuctionOffer(
            shortId,
            offer,
            msg.sender
        );

        // Log Event
        AuctionBidPlaced(
            shortId,
            msg.sender,
            offer,
            currentShortAmount
        );
    }

    // ----- Helper Functions -----

    function validate(
        ShortSellState.State storage state,
        ShortSellCommon.Short short,
        bytes32 shortId,
        uint offer,
        bool hasCurrentOffer,
        uint currentOffer
    )
        internal
        view
        returns (uint _currentShortAmount)
    {
        uint closePeriodStart = getClosePeriodStart(short);

        // The short must either have been called or must be over the maximum duration
        require(block.timestamp >= closePeriodStart);

        // If there is a current offer, the new offer must be for less
        if (hasCurrentOffer) {
            require(offer < currentOffer);
        }

        // Maximum interest fee is what it would be if the entire call time limit elapsed
        uint maxInterestFee = ShortSellCommon.calculateInterestFee(
            short,
            short.shortAmount,
            closePeriodStart.add(short.callTimeLimit)
        );

        // The offered amount must be less than the initia amount of
        // base token held - max interest fee. Recall offer is denominated in terms of closing
        // the entire shortAmount
        uint currentShortAmount = short.shortAmount.sub(short.closedAmount);

        uint initialBaseToken = MathHelpers.getPartialAmount(
            short.shortAmount,
            currentShortAmount,
            Vault(state.VAULT).balances(shortId, short.baseToken)
        );

        require(maxInterestFee <= initialBaseToken); // require there to be some payout
        require(offer <= initialBaseToken.sub(maxInterestFee));

        return currentShortAmount;
    }

    function getClosePeriodStart(
        ShortSellCommon.Short short
    )
        internal
        pure
        returns (uint _timestamp)
    {
        // If the short has been called then the start of the close period is the timestamp of
        // the call. If not, then the start of the close period is the end of the duration of the
        // short.
        if (short.callTimestamp > 0) {
            return short.callTimestamp;
        } else {
            return uint256(short.startTimestamp).add(short.maxDuration);
        }
    }
}
