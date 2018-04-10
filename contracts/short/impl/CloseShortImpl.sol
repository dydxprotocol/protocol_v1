pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { CloseShortShared } from "./CloseShortShared.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Proxy } from "../Proxy.sol";
import { Vault } from "../Vault.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


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
        address indexed closer,
        address indexed payoutRecipient,
        uint256 closeAmount,
        uint256 remainingAmount,
        uint256 baseTokenPaidToLender,
        uint256 quoteTokenPayout,
        uint256 buybackCost
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function closeShortImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 requestedCloseAmount,
        address payoutRecipient,
        address exchangeWrapperAddress,
        bytes memory orderData
    )
        public
        returns (uint256, uint256, uint256)
    {
        CloseShortShared.CloseShortTx memory transaction = CloseShortShared.createCloseShortTx(
            state,
            shortId,
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

        uint256 quoteTokenPayout = CloseShortShared.sendQuoteTokensToPayoutRecipient(
            state,
            transaction,
            buybackCost
        );

        CloseShortShared.closeShortStateUpdate(state, transaction);

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

    // --------- Helper Functions ---------

    function returnBaseTokensToLender(
        ShortSellState.State storage state,
        CloseShortShared.CloseShortTx memory transaction,
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
                transaction.shortLender,
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
        ShortSellState.State storage state,
        CloseShortShared.CloseShortTx transaction,
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
                transaction.shortId,
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
            transaction.shortLender,
            transaction.baseTokenOwed
        );

        return quoteTokenPrice;
    }

    function logEventOnClose(
        CloseShortShared.CloseShortTx transaction,
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
            transaction.baseTokenOwed,
            quoteTokenPayout,
            transaction.availableQuoteToken.sub(quoteTokenPayout)
        );
    }

}
