pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { Proxy } from "../Proxy.sol";
import { CloseShortDelegator } from "../interfaces/CloseShortDelegator.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";
import { PayoutRecipient } from "../interfaces/PayoutRecipient.sol";


/**
 * @title CloseShortImpl
 * @author dYdX
 *
 * This library contains the implementation for the closeShort function of ShortSell
 */
library CloseShortImpl {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short sell was closed
     */
    event ShortClosed(
        bytes32 indexed id,
        address closer,
        address payoutRecipient,
        uint256 closeAmount,
        uint256 remainingAmount,
        uint256 baseTokenPaidToLender,
        uint256 quoteTokenPayout,
        uint256 buybackCost
    );

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct Order {
        address exchangeWrapperAddress;
        bytes orderData;
    }

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function closeShortImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 requestedCloseAmount,
        address payoutRecipient,
        address exchangeWrapperAddress,
        bytes orderData
    )
        public
        returns (
            uint256, // amountClosed
            uint256 quoteTokenPayout,
            uint256 baseTokenPaidToLender
        )
    {
        Order memory order = Order({
            exchangeWrapperAddress: exchangeWrapperAddress,
            orderData: orderData
        });

        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        // Create CloseShortTx and validate closeAmount
        uint256 closeAmount = validateCloseAmount(
            short,
            shortId,
            requestedCloseAmount,
            payoutRecipient
        );
        ShortSellCommon.CloseShortTx memory transaction = ShortSellCommon.parseCloseShortTx(
            state,
            short,
            shortId,
            closeAmount,
            payoutRecipient
        );

        uint256 buybackCost;
        (
            baseTokenPaidToLender,
            buybackCost,
            quoteTokenPayout
        ) = sendTokens(
            state,
            transaction,
            order
        );

        // Delete the short, or just increase the closedAmount
        if (transaction.closeAmount == transaction.currentShortAmount) {
            ShortSellCommon.cleanupShort(state, transaction.shortId);
        } else {
            short.closedAmount = short.closedAmount.add(transaction.closeAmount);
        }

        logEventOnClose(
            transaction,
            baseTokenPaidToLender,
            buybackCost,
            quoteTokenPayout
        );

        return (
            transaction.closeAmount,
            quoteTokenPayout,
            baseTokenPaidToLender
        );
    }

    // --------- Helper Functions ---------

    function validateCloseAmount(
        ShortSellCommon.Short storage short,
        bytes32 shortId,
        uint256 requestedCloseAmount,
        address payoutRecipient
    )
        internal
        returns(uint256)
    {
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        uint256 newCloseAmount = Math.min256(requestedCloseAmount, currentShortAmount);

        // If not the short seller, requires short seller to approve msg.sender
        if (short.seller != msg.sender) {
            uint256 allowedCloseAmount =
                CloseShortDelegator(short.seller).closeOnBehalfOf(
                    msg.sender,
                    payoutRecipient,
                    shortId,
                    newCloseAmount
                );
            require(allowedCloseAmount <= newCloseAmount);
            newCloseAmount = allowedCloseAmount;
        }

        require(newCloseAmount > 0);
        assert(newCloseAmount <= currentShortAmount);
        assert(newCloseAmount <= requestedCloseAmount);
        return newCloseAmount;
    }

    function sendTokens(
        ShortSellState.State storage state,
        ShortSellCommon.CloseShortTx transaction,
        Order order
    )
        internal
        returns (
            uint256, // baseTokenPaidToLender
            uint256, // buybackCost
            uint256  // quoteTokenPayout
        )
    {
        // Send base tokens to lender
        uint256 buybackCost = 0;
        uint256 baseTokenOwedToLender = ShortSellCommon.calculateOwedAmount(
            transaction.short,
            transaction.closeAmount,
            block.timestamp
        );

        if (order.exchangeWrapperAddress == address(0)) {
            // no buy order; send base tokens directly from the closer to the lender
            Proxy(state.PROXY).transferTokens(
                transaction.short.baseToken,
                msg.sender,
                transaction.short.lender,
                baseTokenOwedToLender
            );
        } else {
            // close short using buy order
            buybackCost = buyBackBaseToken(
                state,
                transaction,
                order,
                baseTokenOwedToLender
            );
        }

        // Send quote tokens to the correct parties
        uint256 quoteTokenPayout = sendQuoteTokensOnClose(
            state,
            transaction,
            buybackCost
        );

        // The ending quote token balance of the vault should be the starting quote token balance
        // minus the available quote token amount
        assert(
            Vault(state.VAULT).balances(transaction.shortId, transaction.short.quoteToken)
            == transaction.startingQuoteToken.sub(transaction.availableQuoteToken)
        );

        return (
            baseTokenOwedToLender,
            buybackCost,
            quoteTokenPayout
        );
    }

    function buyBackBaseToken(
        ShortSellState.State storage state,
        ShortSellCommon.CloseShortTx transaction,
        Order order,
        uint256 baseTokenOwedToLender
    )
        internal
        returns (uint256 _buybackCost)
    {
        // Ask the exchange wrapper what the price in quote token to buy back the close
        // amount of base token is
        uint256 quoteTokenPrice = ExchangeWrapper(order.exchangeWrapperAddress).getTakerTokenPrice(
            transaction.short.baseToken,
            transaction.short.quoteToken,
            baseTokenOwedToLender,
            order.orderData
        );

        // Require enough quote token in Vault to pay for both 1) buyback and 2) interest fee
        require(quoteTokenPrice <= transaction.availableQuoteToken);

        // Send the requisite quote token to do the buyback from vault to exchange wrapper
        if (quoteTokenPrice > 0) {
            Vault(state.VAULT).transferFromVault(
                transaction.shortId,
                transaction.short.quoteToken,
                order.exchangeWrapperAddress,
                quoteTokenPrice
            );
        }

        // Trade the quote token for the base token
        uint256 receivedBaseToken = ExchangeWrapper(order.exchangeWrapperAddress).exchange(
            transaction.short.baseToken,
            transaction.short.quoteToken,
            msg.sender,
            quoteTokenPrice,
            order.orderData
        );

        assert(receivedBaseToken == baseTokenOwedToLender);

        // Transfer base token from the exchange wrapper to the lender
        Proxy(state.PROXY).transferTokens(
            transaction.short.baseToken,
            order.exchangeWrapperAddress,
            transaction.short.lender,
            baseTokenOwedToLender
        );

        return quoteTokenPrice;
    }

    function sendQuoteTokensOnClose(
        ShortSellState.State storage state,
        ShortSellCommon.CloseShortTx transaction,
        uint256 buybackCost
    )
        internal
        returns (uint256 _quoteTokenPayout)
    {
        Vault vault = Vault(state.VAULT);

        // Send remaining quote token to payoutRecipient
        uint256 quoteTokenPayout = transaction.availableQuoteToken.sub(buybackCost);

        vault.transferFromVault(
            transaction.shortId,
            transaction.short.quoteToken,
            transaction.payoutRecipient,
            quoteTokenPayout
        );

        if (AddressUtils.isContract(transaction.payoutRecipient)) {
            PayoutRecipient(transaction.payoutRecipient).receiveCloseShortPayout(
                transaction.shortId,
                transaction.closeAmount,
                msg.sender,
                transaction.short.seller,
                transaction.short.quoteToken,
                quoteTokenPayout,
                transaction.availableQuoteToken
            );
        }

        return quoteTokenPayout;
    }

    function logEventOnClose(
        ShortSellCommon.CloseShortTx transaction,
        uint256 baseTokenPaidToLender,
        uint256 buybackCost,
        uint256 quoteTokenPayout
    )
        internal
    {
        emit ShortClosed(
            transaction.shortId,
            msg.sender,
            transaction.payoutRecipient,
            transaction.closeAmount,
            transaction.currentShortAmount.sub(transaction.closeAmount),
            baseTokenPaidToLender,
            quoteTokenPayout,
            buybackCost
        );
    }

}
