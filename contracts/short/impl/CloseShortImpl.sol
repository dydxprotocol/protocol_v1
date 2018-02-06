pragma solidity 0.4.19;

import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { Trader } from "../Trader.sol";
import { ShortSellRepo } from "../ShortSellRepo.sol";
import { LibraryReentrancyGuard } from "./LibraryReentrancyGuard.sol";
import { SafeMathLib } from "../../lib/SafeMathLib.sol";


/**
 * @title CloseShortImpl
 * @author Antonio Juliano
 *
 * This library contains the implementation for the closeShort function of ShortSell
 */
library CloseShortImpl {
    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short sell was closed
     */
    event ShortClosed(
        bytes32 indexed id,
        uint closeAmount,
        uint interestFee,
        uint shortSellerBaseToken,
        uint buybackCost
    );

    /**
     * A short sell was partially closed
     */
    event ShortPartiallyClosed(
        bytes32 indexed id,
        uint closeAmount,
        uint remainingAmount,
        uint interestFee,
        uint shortSellerBaseToken,
        uint buybackCost
    );

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct CloseShortTx {
        ShortSellCommon.Short short;
        uint currentShortAmount;
        bytes32 shortId;
        uint closeAmount;
    }

    struct Order {
        address[5] addresses;
        uint[6] values;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function closeShortImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint requestedCloseAmount,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    )
        public
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        LibraryReentrancyGuard.start(state);

        CloseShortTx memory transaction = parseCloseShortTx(
            state,
            shortId,
            requestedCloseAmount
        );
        Order memory order = parseOrder(
            orderAddresses,
            orderValues,
            orderV,
            orderR,
            orderS
        );

        validateCloseShort(transaction);

        // STATE UPDATES

        // Remove short if it's fully closed, or update the closed amount
        updateStateForCloseShort(state, transaction);


        // EXTERNAL CALLS
        var (interestFee, buybackCost, sellerBaseTokenAmount) = buybackAndSendOnClose(
            state,
            transaction,
            order
        );

        logEventOnClose(
            transaction,
            interestFee,
            buybackCost,
            sellerBaseTokenAmount
        );

        LibraryReentrancyGuard.end(state);

        return (
            sellerBaseTokenAmount,
            interestFee
        );
    }

    function closeShortDirectlyImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint requestedCloseAmount
    )
        public
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        LibraryReentrancyGuard.start(state);

        CloseShortTx memory transaction = parseCloseShortTx(
            state,
            shortId,
            requestedCloseAmount
        );

        validateCloseShort(transaction);

        // STATE UPDATES

        updateStateForCloseShort(state, transaction);
        var (interestFee, closeId) = getInterestFeeAndTransferToCloseVault(state, transaction);

        // EXTERNAL CALLS
        Vault(state. VAULT).transferToVault(
            closeId,
            transaction.short.underlyingToken,
            msg.sender,
            transaction.closeAmount
        );

        uint sellerBaseTokenAmount = sendTokensOnClose(
            state,
            transaction,
            closeId,
            interestFee
        );

        logEventOnClose(
            transaction,
            interestFee,
            0,
            sellerBaseTokenAmount
        );

        LibraryReentrancyGuard.end(state);

        return (
            sellerBaseTokenAmount,
            interestFee
        );
    }

    // --------- Helper Functions ---------

    function validateCloseShort(
        CloseShortTx transaction
    )
        internal
        view
    {
        require(transaction.closeAmount > 0);
        require(transaction.short.seller == msg.sender);
    }

    function updateStateForCloseShort(
        ShortSellState.State storage state,
        CloseShortTx transaction
    )
        internal
    {
        // If the whole short is closed, remove it from repo
        if (transaction.closeAmount == transaction.currentShortAmount) {
            ShortSellCommon.cleanupShort(
                state,
                transaction.shortId
            );

            // EXTERNAL CALL (comes after state update)
            // If the whole short is closed and there is an auction offer, send it back
            ShortSellCommon.payBackAuctionBidderIfExists(
                state,
                transaction.shortId,
                transaction.short
            );
        } else {
            uint newClosedAmount = SafeMathLib.add(
                transaction.short.closedAmount,
                transaction.closeAmount
            );
            assert(newClosedAmount < transaction.short.shortAmount);

            // Otherwise increment the closed amount on the short
            ShortSellRepo(state.REPO).setShortClosedAmount(
                transaction.shortId,
                newClosedAmount
            );
        }
    }

    function getInterestFeeAndTransferToCloseVault(
        ShortSellState.State storage state,
        CloseShortTx transaction
    )
        internal
        returns (
            uint _interestFee,
            bytes32 _closeId
        )
    {
        return (
            ShortSellCommon.calculateInterestFee(
                transaction.short,
                transaction.closeAmount,
                block.timestamp
            ),
            ShortSellCommon.transferToCloseVault(
                state,
                transaction.short,
                transaction.shortId,
                transaction.closeAmount
            )
        );
    }

    function buybackAndSendOnClose(
        ShortSellState.State storage state,
        CloseShortTx transaction,
        Order order
    )
        internal
        returns (
            uint _interestFee,
            uint _buybackCost,
            uint _sellerBaseTokenAmount
        )
    {
        // First transfer base token used for close into new vault. Vault will then validate
        // this is the maximum base token that can be used by this close
        // Prefer to use a new vault, so this close cannot touch the rest of the
        // funds held in the original short vault

        var (interestFee, closeId) = getInterestFeeAndTransferToCloseVault(state, transaction);

        uint buybackCost = buyBackUnderlyingToken(
            state,
            transaction,
            order,
            closeId,
            interestFee
        );

        uint sellerBaseTokenAmount = sendTokensOnClose(
            state,
            transaction,
            closeId,
            interestFee
        );

        return (
            interestFee,
            buybackCost,
            sellerBaseTokenAmount
        );
    }

    function buyBackUnderlyingToken(
        ShortSellState.State storage state,
        CloseShortTx transaction,
        Order order,
        bytes32 closeId,
        uint interestFee
    )
        internal
        returns (uint _buybackCost)
    {
        uint baseTokenPrice = getBaseTokenPriceForBuyback(
            state,
            transaction,
            order,
            interestFee,
            closeId
        );

        if (order.addresses[2] != address(0)) {
            transferFeeForBuyback(
                state,
                transaction,
                order,
                closeId,
                baseTokenPrice
            );
        }

        var (buybackCost, ) = Trader(state.TRADER).trade(
            closeId,
            [
                order.addresses[0],
                order.addresses[1],
                transaction.short.underlyingToken,
                transaction.short.baseToken,
                order.addresses[2],
                order.addresses[3],
                order.addresses[4]
            ],
            order.values,
            baseTokenPrice,
            order.v,
            order.r,
            order.s,
            true
        );

        // Should now hold exactly closeAmount of underlying token
        assert(
            Vault(state.VAULT).balances(
                closeId, transaction.short.underlyingToken
            ) == transaction.closeAmount
        );

        address takerFeeToken = order.addresses[4];

        // Assert take fee token balance is 0. The only cases where it should not be 0
        // is if it is either baseToken or underlyingToken
        if (
            takerFeeToken != transaction.short.baseToken
            && takerFeeToken != transaction.short.underlyingToken
        ) {
            assert(Vault(state.VAULT).balances(closeId, takerFeeToken) == 0);
        }

        return buybackCost;
    }

    function getBaseTokenPriceForBuyback(
        ShortSellState.State storage state,
        CloseShortTx transaction,
        Order order,
        uint interestFee,
        bytes32 closeId
    )
        internal
        view
        returns (uint _baseTokenPrice)
    {
        // baseTokenPrice = closeAmount * (buyOrderBaseTokenAmount / buyOrderUnderlyingTokenAmount)
        uint baseTokenPrice = SafeMathLib.getPartialAmount(
            order.values[1],
            order.values[0],
            transaction.closeAmount
        );

        // We need to have enough base token locked in the the close's vault to pay
        // for both the buyback and the interest fee
        require(
            SafeMathLib.add(baseTokenPrice, interestFee)
            <= Vault(state.VAULT).balances(closeId, transaction.short.baseToken)
        );

        return baseTokenPrice;
    }

    function transferFeeForBuyback(
        ShortSellState.State storage state,
        CloseShortTx transaction,
        Order order,
        bytes32 closeId,
        uint baseTokenPrice
    )
        internal
    {
        address takerFeeToken = order.addresses[4];

        // If the taker fee token is base token, then just pay it out of what is held in Vault
        // and do not transfer it in from the short seller
        if (transaction.short.baseToken == takerFeeToken) {
            return;
        }

        uint buyOrderTakerFee = order.values[3];
        uint buyOrderTakerTokenAmount = order.values[1];

        // takerFee = buyOrderTakerFee * (baseTokenPrice / buyOrderBaseTokenAmount)
        uint takerFee = SafeMathLib.getPartialAmount(
            baseTokenPrice,
            buyOrderTakerTokenAmount,
            buyOrderTakerFee
        );

        // Transfer taker fee for buyback
        if (takerFee > 0) {
            Vault(state.VAULT).transferToVault(
                closeId,
                takerFeeToken,
                msg.sender,
                takerFee
            );
        }
    }

    function sendTokensOnClose(
        ShortSellState.State storage state,
        CloseShortTx transaction,
        bytes32 closeId,
        uint interestFee
    )
        internal
        returns (uint _sellerBaseTokenAmount)
    {
        Vault vault = Vault(state.VAULT);

        // Send original loaned underlying token to lender
        vault.sendFromVault(
            closeId,
            transaction.short.underlyingToken,
            transaction.short.lender,
            transaction.closeAmount
        );

        // Send base token interest fee to lender
        if (interestFee > 0) {
            vault.sendFromVault(
                closeId,
                transaction.short.baseToken,
                transaction.short.lender,
                interestFee
            );
        }

        // Send remaining base token to seller (= deposit + profit - interestFee)
        // Also note if the takerFeeToken on the sell order is baseToken, that fee will also
        // have been paid out of the vault balance
        uint sellerBaseTokenAmount = vault.balances(closeId, transaction.short.baseToken);
        vault.sendFromVault(
            closeId,
            transaction.short.baseToken,
            transaction.short.seller,
            sellerBaseTokenAmount
        );

        // Should now hold no balance of base or underlying token
        assert(vault.balances(closeId, transaction.short.underlyingToken) == 0);
        assert(vault.balances(closeId, transaction.short.baseToken) == 0);

        return sellerBaseTokenAmount;
    }

    function logEventOnClose(
        CloseShortTx transaction,
        uint interestFee,
        uint buybackCost,
        uint sellerBaseTokenAmount
    )
        internal
    {
        if (transaction.closeAmount == transaction.currentShortAmount) {
            ShortClosed(
                transaction.shortId,
                transaction.closeAmount,
                interestFee,
                sellerBaseTokenAmount,
                buybackCost
            );
        } else {
            ShortPartiallyClosed(
                transaction.shortId,
                transaction.closeAmount,
                SafeMathLib.sub(transaction.currentShortAmount, transaction.closeAmount),
                interestFee,
                sellerBaseTokenAmount,
                buybackCost
            );
        }
    }

    // -------- Parsing Functions -------

    function parseCloseShortTx(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint requestedCloseAmount
    )
        internal
        view
        returns (CloseShortTx _tx)
    {
        ShortSellCommon.Short memory short = ShortSellCommon.getShortObject(state, shortId);
        uint currentShortAmount = SafeMathLib.sub(short.shortAmount, short.closedAmount);
        return CloseShortTx({
            short: short,
            currentShortAmount: currentShortAmount,
            shortId: shortId,
            closeAmount: SafeMathLib.min256(requestedCloseAmount, currentShortAmount)
        });
    }

    function parseOrder(
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    )
        internal
        pure
        returns (Order _order)
    {
        return Order({
            addresses: orderAddresses,
            values: orderValues,
            v: orderV,
            r: orderR,
            s: orderS
        });
    }
}
