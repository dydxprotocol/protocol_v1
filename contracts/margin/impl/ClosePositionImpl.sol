pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ClosePositionShared } from "./ClosePositionShared.sol";
import { MarginState } from "./MarginState.sol";
import { Proxy } from "../Proxy.sol";
import { Vault } from "../Vault.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";


/**
 * @title ClosePositionImpl
 * @author dYdX
 *
 * This library contains the implementation for the closePosition function of Margin
 */
library ClosePositionImpl {
    using SafeMath for uint256;

    // ============ Events ============

    /**
     * A position was closed
     */
    event PositionClosed(
        bytes32 indexed marginId,
        address indexed closer,
        address indexed payoutRecipient,
        uint256 closeAmount,
        uint256 remainingAmount,
        uint256 baseTokenPaidToLender,
        uint256 payoutAmount,
        uint256 buybackCost,
        bool payoutInQuoteToken
    );

    // ============ Public Implementation Functions ============

    function closePositionImpl(
        MarginState.State storage state,
        bytes32 marginId,
        uint256 requestedCloseAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool payoutInQuoteToken,
        bytes memory orderData
    )
        public
        returns (uint256, uint256, uint256)
    {
        ClosePositionShared.CloseTx memory transaction = ClosePositionShared.createCloseTx(
            state,
            marginId,
            requestedCloseAmount,
            payoutRecipient,
            exchangeWrapper,
            payoutInQuoteToken,
            false
        );

        uint256 buybackCost;
        uint256 receivedBaseToken;

        (buybackCost, receivedBaseToken) = returnBaseTokensToLender(
            state,
            transaction,
            orderData
        );

        uint256 payout = ClosePositionShared.sendQuoteTokensToPayoutRecipient(
            state,
            transaction,
            buybackCost,
            receivedBaseToken
        );

        ClosePositionShared.closePositionStateUpdate(state, transaction);

        logEventOnClose(
            transaction,
            buybackCost,
            payout
        );

        return (
            transaction.closeAmount,
            payout,
            transaction.baseTokenOwed
        );
    }

    // ============ Helper Functions ============

    function returnBaseTokensToLender(
        MarginState.State storage state,
        ClosePositionShared.CloseTx memory transaction,
        bytes memory orderData
    )
        internal
        returns (uint256, uint256)
    {
        uint256 buybackCost = 0;
        uint256 receivedBaseToken = 0;

        if (transaction.exchangeWrapper == address(0)) {
            require(transaction.payoutInQuoteToken);

            // No buy order; send base tokens directly from the closer to the lender
            Proxy(state.PROXY).transferTokens(
                transaction.baseToken,
                msg.sender,
                transaction.positionLender,
                transaction.baseTokenOwed
            );
        } else {
            // Buy back base tokens using buy order and send to lender
            (buybackCost, receivedBaseToken) = buyBackBaseToken(
                state,
                transaction,
                orderData
            );
        }
        return (buybackCost, receivedBaseToken);
    }

    function buyBackBaseToken(
        MarginState.State storage state,
        ClosePositionShared.CloseTx transaction,
        bytes memory orderData
    )
        internal
        returns (uint256, uint256)
    {
        // Ask the exchange wrapper what the price in quote token to buy back the close
        // amount of base token is
        uint256 quoteTokenPrice;

        if (transaction.payoutInQuoteToken) {
            quoteTokenPrice = ExchangeWrapper(transaction.exchangeWrapper)
                .getTakerTokenPrice(
                    transaction.baseToken,
                    transaction.quoteToken,
                    transaction.baseTokenOwed,
                    orderData
                );

            // Require enough available quote token to pay for the buyback
            require(quoteTokenPrice <= transaction.availableQuoteToken);
        } else {
            quoteTokenPrice = transaction.availableQuoteToken;
        }

        // Send the requisite quote token to do the buyback from vault to exchange wrapper
        if (quoteTokenPrice > 0) {
            Vault(state.VAULT).transferFromVault(
                transaction.marginId,
                transaction.quoteToken,
                transaction.exchangeWrapper,
                quoteTokenPrice
            );
        }

        // Trade the quote token for the base token
        uint256 receivedBaseToken = ExchangeWrapper(transaction.exchangeWrapper).exchange(
            transaction.baseToken,
            transaction.quoteToken,
            msg.sender,
            quoteTokenPrice,
            orderData
        );

        if (transaction.payoutInQuoteToken) {
            assert(receivedBaseToken == transaction.baseTokenOwed);
        } else {
            require(receivedBaseToken >= transaction.baseTokenOwed);
        }

        // Transfer base token from the exchange wrapper to the lender
        Proxy(state.PROXY).transferTokens(
            transaction.baseToken,
            transaction.exchangeWrapper,
            transaction.positionLender,
            transaction.baseTokenOwed
        );

        return (quoteTokenPrice, receivedBaseToken);
    }

    function logEventOnClose(
        ClosePositionShared.CloseTx transaction,
        uint256 buybackCost,
        uint256 payout
    )
        internal
    {
        emit PositionClosed(
            transaction.marginId,
            msg.sender,
            transaction.payoutRecipient,
            transaction.closeAmount,
            transaction.currentPrincipal.sub(transaction.closeAmount),
            transaction.baseTokenOwed,
            payout,
            buybackCost,
            transaction.payoutInQuoteToken
        );
    }

}
