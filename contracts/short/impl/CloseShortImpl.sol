pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../vault/Vault.sol";
import { Trader } from "../Trader.sol";
import { CloseShortVerifier } from "../interfaces/CloseShortVerifier.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


/**
 * @title CloseShortImpl
 * @author dYdX
 *
 * This library contains the implementation for the closeShort function of ShortSell
 */
library CloseShortImpl {
    using SafeMath for uint;

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
        ShortSellCommon.Short short; // TODO check if storage
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
            uint _amountClosed,
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        Order memory order = parseOrder(
            orderAddresses,
            orderValues,
            orderV,
            orderR,
            orderS
        );
        return closeShortInternal(
            state,
            shortId,
            requestedCloseAmount,
            order);
    }

    function closeShortDirectlyImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint requestedCloseAmount
    )
        public
        returns (
            uint _amountClosed,
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        Order memory order;
        return closeShortInternal(
            state,
            shortId,
            requestedCloseAmount,
            order);
    }

    // --------- Helper Functions ---------

    function closeShortInternal(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint requestedCloseAmount,
        Order memory order
    )
        internal
        returns (
            uint _amountClosed,
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        // Create CloseShortTx and validate closeAmount
        CloseShortTx memory transaction = parseCloseShortTx(state, shortId, requestedCloseAmount);
        validateCloseShortTx(transaction); // may modify transaction

        // State updates
        updateStateForCloseShort(state, transaction);
        var (interestFee, closeId) = getInterestFeeAndTransferToCloseVault(state, transaction);

        // Secure underlying tokens
        uint buybackCost = 0;
        if (order.addresses[0] == 0) { // no buy order; close short directly
            Vault(state.VAULT).transferToVault(
                closeId,
                transaction.short.underlyingToken,
                msg.sender,
                transaction.closeAmount
            );
        } else { // close short using buy order
            buybackCost = buyBackUnderlyingToken(
                state,
                transaction,
                order,
                closeId,
                interestFee
            );
        }

        // Send base tokens and underlying tokens to the correct parties
        uint sellerBaseTokenAmount = sendTokensOnClose(
            state,
            transaction,
            closeId,
            interestFee,
            msg.sender
        );

        logEventOnClose(
            transaction,
            interestFee,
            buybackCost,
            sellerBaseTokenAmount
        );

        return (
            transaction.closeAmount,
            sellerBaseTokenAmount,
            interestFee
        );
    }

    /**
     * Validate the CloseShortTx object created for closing a short.
     * This function may throw, or it may simply modify parameters of the CloseShortTx object.
     * Will not throw if the resulting object is valid.
     * @param transaction  The transaction to validate
     */
    function validateCloseShortTx(
        CloseShortTx transaction
    )
        internal
    {
        // if closer is not short seller, we have to make sure this is okay with the short seller
        if (transaction.short.seller != msg.sender) {
            uint256 allowedCloseAmount = CloseShortVerifier(transaction.short.seller)
                .closeOnBehalfOf(msg.sender, transaction.shortId, transaction.closeAmount);

            // because the verifier will do accounting based on how much it returns, we should
            // revert if we are not able to close as much as the verifier returns
            require(transaction.closeAmount >= allowedCloseAmount);
            transaction.closeAmount = allowedCloseAmount;
        }

        require(transaction.closeAmount > 0);
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
            uint newClosedAmount = transaction.short.closedAmount.add(transaction.closeAmount);
            assert(newClosedAmount < transaction.short.shortAmount);

            // Otherwise increment the closed amount on the short
            state.shorts[transaction.shortId].closedAmount = newClosedAmount;
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
        uint baseTokenPrice = MathHelpers.getPartialAmount(
            order.values[1],
            order.values[0],
            transaction.closeAmount
        );

        // We need to have enough base token locked in the the close's vault to pay
        // for both the buyback and the interest fee
        require(
            baseTokenPrice.add(interestFee)
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
        uint takerFee = MathHelpers.getPartialAmount(
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
        uint interestFee,
        address closer
    )
        internal
        returns (uint _sellerBaseTokenAmount)
    {
        Vault vault = Vault(state.VAULT);

        // Send original loaned underlying token to lender
        vault.transferToSafetyDepositBox(
            closeId,
            transaction.short.underlyingToken,
            transaction.short.lender,
            transaction.closeAmount
        );

        // Send base token interest fee to lender
        if (interestFee > 0) {
            vault.transferToSafetyDepositBox(
                closeId,
                transaction.short.baseToken,
                transaction.short.lender,
                interestFee
            );
        }

        // Send remaining base token to closer (= deposit + profit - interestFee)
        // Also note if the takerFeeToken on the sell order is baseToken, that fee will also
        // have been paid out of the vault balance
        uint sellerBaseTokenAmount = vault.balances(closeId, transaction.short.baseToken);
        vault.transferToSafetyDepositBox(
            closeId,
            transaction.short.baseToken,
            closer,
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
                transaction.currentShortAmount.sub(transaction.closeAmount),
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
        returns (CloseShortTx memory _tx)
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShort(state, shortId);
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);

        return CloseShortTx({
            short: short,
            currentShortAmount: currentShortAmount,
            shortId: shortId,
            closeAmount: Math.min256(requestedCloseAmount, currentShortAmount)
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
