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
        uint256 quoteTokenPayout,
        uint256 buybackCost
    );

    // ============ Public Implementation Functions ============

    function closePositionImpl(
        MarginState.State storage state,
        bytes32 marginId,
        uint256 requestedCloseAmount,
        address payoutRecipient,
        address exchangeWrapperAddress,
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
            false
        );

        uint256 buybackCost = returnBaseTokensToLender(
            state,
            transaction,
            exchangeWrapperAddress,
            orderData
        );

        uint256 quoteTokenPayout = ClosePositionShared.sendQuoteTokensToPayoutRecipient(
            state,
            transaction,
            buybackCost
        );

        ClosePositionShared.ClosePositionStateUpdate(state, transaction);

        logEventOnClose(
            transaction,
            quoteTokenPayout
        );

        return (
            transaction.closeAmount,
            quoteTokenPayout,
            transaction.baseTokenOwed
        );
    }

    // ============ Helper Functions ============

    function returnBaseTokensToLender(
        MarginState.State storage state,
        ClosePositionShared.CloseTx memory transaction,
        address exchangeWrapperAddress,
        bytes memory orderData
    )
        internal
        returns (uint256)
    {
        uint256 buybackCost = 0;
        if (exchangeWrapperAddress == address(0)) {
            // No buy order; send base tokens directly from the closer to the lender
            Proxy(state.PROXY).transferTokens(
                transaction.baseToken,
                msg.sender,
                transaction.lender,
                transaction.baseTokenOwed
            );
        } else {
            // Buy back base tokens using buy order and send to lender
            buybackCost = buyBackBaseToken(
                state,
                transaction,
                exchangeWrapperAddress,
                orderData
            );
        }
        return buybackCost;
    }

    function buyBackBaseToken(
        MarginState.State storage state,
        ClosePositionShared.CloseTx memory transaction,
        address exchangeWrapperAddress,
        bytes memory orderData
    )
        internal
        returns (uint256)
    {
        // Ask the exchange wrapper what the price in quote token to buy back the close
        // amount of base token is
        uint256 quoteTokenPrice = ExchangeWrapper(exchangeWrapperAddress).getTakerTokenPrice(
            transaction.baseToken,
            transaction.quoteToken,
            transaction.baseTokenOwed,
            orderData
        );

        // Require enough quote token in Vault to pay for both 1) buyback and 2) interest fee
        require(quoteTokenPrice <= transaction.availableQuoteToken);

        // Send the requisite quote token to do the buyback from vault to exchange wrapper
        if (quoteTokenPrice > 0) {
            Vault(state.VAULT).transferFromVault(
                transaction.marginId,
                transaction.quoteToken,
                exchangeWrapperAddress,
                quoteTokenPrice
            );
        }

        // Trade the quote token for the base token
        uint256 receivedBaseToken = ExchangeWrapper(exchangeWrapperAddress).exchange(
            transaction.baseToken,
            transaction.quoteToken,
            msg.sender,
            quoteTokenPrice,
            orderData
        );

        assert(receivedBaseToken == transaction.baseTokenOwed);

        // Transfer base token from the exchange wrapper to the lender
        Proxy(state.PROXY).transferTokens(
            transaction.baseToken,
            exchangeWrapperAddress,
            transaction.lender,
            transaction.baseTokenOwed
        );

        return quoteTokenPrice;
    }

    function logEventOnClose(
        ClosePositionShared.CloseTx memory transaction,
        uint256 quoteTokenPayout
    )
        internal
    {
        emit PositionClosed(
            transaction.marginId,
            msg.sender,
            transaction.payoutRecipient,
            transaction.closeAmount,
            transaction.currentPositionAmount.sub(transaction.closeAmount),
            transaction.baseTokenOwed,
            quoteTokenPayout,
            transaction.availableQuoteToken.sub(quoteTokenPayout)
        );
    }

}
