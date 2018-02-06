pragma solidity 0.4.19;

import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellAuctionRepo } from "../ShortSellAuctionRepo.sol";
import { Vault } from "../Vault.sol";
import { LibraryReentrancyGuard } from "./LibraryReentrancyGuard.sol";
import { SafeMathLib } from "../../lib/SafeMathLib.sol";


/**
 * @title PlaceSellbackBidImpl
 * @author Antonio Juliano
 *
 * This library contains the implementation for the placeSellbackBid function of ShortSell
 */
library PlaceSellbackBidImpl {
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
        LibraryReentrancyGuard.start(state);

        ShortSellCommon.Short memory short = ShortSellCommon.getShortObject(state, shortId);

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
            Vault(state.VAULT).sendFromVault(
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

        LibraryReentrancyGuard.end(state);
    }

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
            SafeMathLib.add(closePeriodStart, short.callTimeLimit)
        );

        // The offered amount must be less than the initia amount of
        // base token held - max interest fee. Recall offer is denominated in terms of closing
        // the entire shortAmount
        uint currentShortAmount = SafeMathLib.sub(short.shortAmount, short.closedAmount);

        uint initialBaseToken = SafeMathLib.getPartialAmount(
            short.shortAmount,
            currentShortAmount,
            Vault(state.VAULT).balances(shortId, short.baseToken)
        );

        require(offer <= SafeMathLib.sub(initialBaseToken, maxInterestFee));

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
            return ShortSellCommon.getShortEndTimestamp(short);
        }
    }
}
