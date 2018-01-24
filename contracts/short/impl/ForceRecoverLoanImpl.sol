pragma solidity 0.4.18;

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { SafeMath } from "../../lib/SafeMath.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellEvents } from "./ShortSellEvents.sol";
import { ShortCommonHelperFunctions } from "./ShortCommonHelperFunctions.sol";
import { Vault } from "../Vault.sol";
import { ShortSellAuctionRepo } from "../ShortSellAuctionRepo.sol";

/**
 * @title ForceRecoverLoanImpl
 * @author Antonio Juliano
 *
 * This contract contains the implementation for the forceRecoverLoan function of ShortSell
 */
 /* solium-disable-next-line */
contract ForceRecoverLoanImpl is
    SafeMath,
    ShortSellState,
    ShortSellEvents,
    ReentrancyGuard,
    ShortCommonHelperFunctions {

    // -------------------------------------------
    // ---- Internal Implementation Functions ----
    // -------------------------------------------

    function forceRecoverLoanImpl(
        bytes32 shortId
    )
        internal
        nonReentrant
        returns (uint _baseTokenAmount)
    {
        Short memory short = getShortObject(shortId);
        var (offer, bidder, hasCurrentOffer) =
            ShortSellAuctionRepo(AUCTION_REPO).getAuction(shortId);

        // Can only force recover after the entire call period has elapsed
        // This can either be after the loan was called or after the maxDuration of the short
        // position has elapsed (plus the call time)
        require(
            block.timestamp >= add(uint(short.callTimestamp), uint(short.callTimeLimit))
            || block.timestamp >= add(getShortEndTimestamp(short), uint(short.callTimeLimit))
        );

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
            bidder,
            lenderBaseTokenAmount,
            hasCurrentOffer,
            buybackCost
        );

        return lenderBaseTokenAmount;
    }

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
            vault.sendFromVault(
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

        vault.sendFromVault(
            shortId,
            short.baseToken,
            short.lender,
            lenderBaseTokenAmount
        );

        // Send the lender back the borrowed tokens (out of the auction vault)

        vault.sendFromVault(
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
            vault.sendFromVault(
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

        vault.sendFromVault(
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
        vault.sendFromVault(
            shortId,
            short.baseToken,
            short.seller,
            vault.balances(shortId, short.baseToken)
        );
    }
}
