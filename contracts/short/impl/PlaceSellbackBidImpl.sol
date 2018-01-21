pragma solidity 0.4.18;

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { SafeMath } from "../../lib/SafeMath.sol";
import { ShortCommonHelperFunctions } from "./ShortCommonHelperFunctions.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellEvents } from "./ShortSellEvents.sol";
import { ShortSellAuctionRepo } from "../ShortSellAuctionRepo.sol";
import { Vault } from "../Vault.sol";


/**
 * @title PlaceSellbackBidImpl
 * @author Antonio Juliano
 *
 * This contract contains the implementation for the placeSellbackBid function of ShortSell
 */
 /* solium-disable-next-line */
contract PlaceSellbackBidImpl is
    SafeMath,
    ShortSellState,
    ShortSellEvents,
    ReentrancyGuard,
    ShortCommonHelperFunctions {

    function placeSellbackBidImpl(
        bytes32 shortId,
        uint offer
    )
        internal
        nonReentrant
    {
        Short memory short = getShortObject(shortId);

        var (currentOffer, currentBidder, hasCurrentOffer) =
            ShortSellAuctionRepo(AUCTION_REPO).getAuction(shortId);

        uint currentShortAmount = validate(
            short,
            shortId,
            offer,
            hasCurrentOffer,
            currentOffer
        );

        // Store auction funds in a separate vault for isolation
        bytes32 auctionVaultId = getAuctionVaultId(shortId);

        // If a previous bidder has been outbid, give them their tokens back
        if (hasCurrentOffer) {
            Vault(VAULT).sendFromVault(
                auctionVaultId,
                short.underlyingToken,
                currentBidder,
                Vault(VAULT).balances(auctionVaultId, short.underlyingToken)
            );
        }

        // Transfer the full underlying token amount from the bidder
        Vault(VAULT).transferToVault(
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


    function validate(
        Short short,
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
        uint maxInterestFee = calculateInterestFee(
            short,
            short.shortAmount,
            add(closePeriodStart, short.callTimeLimit)
        );

        // The offered amount must be less than the initia amount of
        // base token held - max interest fee. Recall offer is denominated in terms of closing
        // the entire shortAmount
        uint currentShortAmount = sub(short.shortAmount, short.closedAmount);

        uint initialBaseToken = getPartialAmount(
            short.shortAmount,
            currentShortAmount,
            Vault(VAULT).balances(shortId, short.baseToken)
        );

        require(offer <= sub(initialBaseToken, maxInterestFee));

        return currentShortAmount;
    }

    function getClosePeriodStart(
        Short short
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
            return getShortEndTimestamp(short);
        }
    }
}
