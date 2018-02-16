pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { Vault } from "../Vault.sol";
import { ShortSellAuctionRepo } from "../ShortSellAuctionRepo.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


/**
 * @title ForceRecoverLoanImpl
 * @author dYdX
 *
 * This library contains the implementation for the forceRecoverLoan function of ShortSell
 */
library ForceRecoverLoanImpl {
    using SafeMath for uint;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short sell loan was forcibly recovered by the lender
     */
    event LoanForceRecovered(
        bytes32 indexed id,
        address indexed winningBidder,
        uint amount,
        bool hadAcutcionOffer,
        uint buybackCost
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function forceRecoverLoanImpl(
        ShortSellState.State storage state,
        bytes32 shortId
    )
        public
        returns (uint _baseTokenAmount)
    {
        ShortSellCommon.Short memory short = ShortSellCommon.getShortObject(state.REPO, shortId);
        var (offer, bidder, hasCurrentOffer) =
            ShortSellAuctionRepo(state.AUCTION_REPO).getAuction(shortId);

        // Can only force recover after the entire call period has elapsed
        // This can either be after the loan was called or after the maxDuration of the short
        // position has elapsed (plus the call time)
        require(
            block.timestamp >= uint(short.callTimestamp).add(uint(short.callTimeLimit))
            || (
                block.timestamp
                >= ShortSellCommon.getShortEndTimestamp(short).add(uint(short.callTimeLimit))
            )
        );

        // Only the lender or the winning bidder can call recover the loan
        require(msg.sender == short.lender || msg.sender == bidder);

        // Delete the short
        ShortSellCommon.cleanupShort(
            state,
            shortId
        );

        // Send the tokens
        var (lenderBaseTokenAmount, buybackCost) = sendTokensOnForceRecover(
            state,
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

    // --------- Helper Functions ---------

    function sendTokensOnForceRecover(
        ShortSellState.State storage state,
        ShortSellCommon.Short short,
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
        Vault vault = Vault(state.VAULT);

        if (!hasCurrentOffer) {
            // If there is no auction bid to sell back the underlying token owed to the lender
            // then give the lender everything locked in the position
            vault.transferToSafetyDepositBox(
                shortId,
                short.baseToken,
                short.lender,
                vault.balances(shortId, short.baseToken)
            );

            return (0, 0);
        } else {
            return sendTokensOnForceRecoverWithAuctionBid(
                state,
                short,
                shortId,
                offer,
                bidder
            );
        }
    }

    function sendTokensOnForceRecoverWithAuctionBid(
        ShortSellState.State storage state,
        ShortSellCommon.Short short,
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
        uint currentShortAmount = short.shortAmount.sub(short.closedAmount);
        bytes32 auctionVaultId = ShortSellCommon.getAuctionVaultId(shortId);

        // Send the lender underlying tokens + interest fee
        uint lenderBaseTokenAmount = sendToLenderOnForceCloseWithAuctionBid(
            state,
            short,
            shortId,
            currentShortAmount,
            auctionVaultId
        );

        // Send the auction bidder any leftover underlying token, and base token proportional
        // to what he bid
        uint buybackCost = sendToBidderOnForceCloseWithAuctionBid(
            state,
            short,
            shortId,
            currentShortAmount,
            bidder,
            offer,
            auctionVaultId
        );

        // Send the short seller whatever is left
        sendToShortSellerOnForceCloseWithAuctionBid(
            state,
            short,
            shortId
        );

        return (lenderBaseTokenAmount, buybackCost);
    }

    function sendToLenderOnForceCloseWithAuctionBid(
        ShortSellState.State storage state,
        ShortSellCommon.Short short,
        bytes32 shortId,
        uint currentShortAmount,
        bytes32 auctionVaultId
    )
        internal
        returns (uint _lenderBaseTokenAmount)
    {
        Vault vault = Vault(state.VAULT);

        // If there is an auction bid to sell back the underlying token owed to the lender
        // then give the lender just the owed interest fee at the end of the call time
        uint lenderBaseTokenAmount = ShortSellCommon.calculateInterestFee(
            short,
            currentShortAmount,
            uint(short.callTimestamp).add(short.callTimeLimit)
        );

        vault.transferToSafetyDepositBox(
            shortId,
            short.baseToken,
            short.lender,
            lenderBaseTokenAmount
        );

        // Send the lender back the borrowed tokens (out of the auction vault)

        vault.transferToSafetyDepositBox(
            auctionVaultId,
            short.underlyingToken,
            short.lender,
            currentShortAmount
        );

        return lenderBaseTokenAmount;
    }

    function sendToBidderOnForceCloseWithAuctionBid(
        ShortSellState.State storage state,
        ShortSellCommon.Short short,
        bytes32 shortId,
        uint currentShortAmount,
        address bidder,
        uint offer,
        bytes32 auctionVaultId
    )
        internal
        returns (uint _buybackCost)
    {
        Vault vault = Vault(state.VAULT);

        // If there is extra underlying token leftover, send it back to the bidder
        uint remainingAuctionVaultBalance = vault.balances(
            auctionVaultId, short.underlyingToken
        );

        if (remainingAuctionVaultBalance > 0) {
            vault.transferToSafetyDepositBox(
                auctionVaultId,
                short.underlyingToken,
                bidder,
                remainingAuctionVaultBalance
            );
        }

        // Send the bidder the bidded amount of base token
        uint auctionAmount = MathHelpers.getPartialAmount(
            currentShortAmount,
            short.shortAmount,
            offer
        );

        vault.transferToSafetyDepositBox(
            shortId,
            short.baseToken,
            bidder,
            auctionAmount
        );

        return auctionAmount;
    }

    function sendToShortSellerOnForceCloseWithAuctionBid(
        ShortSellState.State storage state,
        ShortSellCommon.Short short,
        bytes32 shortId
    )
        internal
    {
        Vault vault = Vault(state.VAULT);

        // Send the short seller whatever is left
        // (== margin deposit + interest fee - bid offer)
        vault.transferToSafetyDepositBox(
            shortId,
            short.baseToken,
            short.seller,
            vault.balances(shortId, short.baseToken)
        );
    }
}
