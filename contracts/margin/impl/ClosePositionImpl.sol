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
        bytes32 indexed positionId,
        address indexed closer,
        address indexed payoutRecipient,
        uint256 closeAmount,
        uint256 remainingAmount,
        uint256 owedTokenPaidToLender,
        uint256 payoutAmount,
        uint256 buybackCost,
        bool payoutInHeldToken
    );

    // ============ Public Implementation Functions ============

    function closePositionImpl(
        MarginState.State storage state,
        bytes32 positionId,
        uint256 requestedCloseAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool payoutInHeldToken,
        bytes memory orderData
    )
        public
        returns (uint256, uint256, uint256)
    {
        ClosePositionShared.CloseTx memory transaction = ClosePositionShared.createCloseTx(
            state,
            positionId,
            requestedCloseAmount,
            payoutRecipient,
            exchangeWrapper,
            payoutInHeldToken,
            false
        );

        uint256 buybackCost;
        uint256 receivedOwedToken;

        (buybackCost, receivedOwedToken) = returnOwedTokensToLender(
            state,
            transaction,
            orderData
        );

        uint256 payout = ClosePositionShared.sendHeldTokensToPayoutRecipient(
            state,
            transaction,
            buybackCost,
            receivedOwedToken
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
            transaction.owedTokenOwed
        );
    }

    // ============ Helper Functions ============

    function returnOwedTokensToLender(
        MarginState.State storage state,
        ClosePositionShared.CloseTx memory transaction,
        bytes memory orderData
    )
        internal
        returns (uint256, uint256)
    {
        uint256 buybackCost = 0;
        uint256 receivedOwedToken = 0;

        if (transaction.exchangeWrapper == address(0)) {
            require(transaction.payoutInHeldToken);

            // No buy order; send owedTokens directly from the closer to the lender
            Proxy(state.PROXY).transferTokens(
                transaction.owedToken,
                msg.sender,
                transaction.positionLender,
                transaction.owedTokenOwed
            );
        } else {
            // Buy back owedTokens using buy order and send to lender
            (buybackCost, receivedOwedToken) = buyBackOwedToken(
                state,
                transaction,
                orderData
            );
        }
        return (buybackCost, receivedOwedToken);
    }

    function buyBackOwedToken(
        MarginState.State storage state,
        ClosePositionShared.CloseTx transaction,
        bytes memory orderData
    )
        internal
        returns (uint256, uint256)
    {
        // Ask the exchange wrapper what the price in heldToken to buy back the close
        // amount of owedToken is
        uint256 heldTokenPrice;

        if (transaction.payoutInHeldToken) {
            heldTokenPrice = ExchangeWrapper(transaction.exchangeWrapper)
                .getTakerTokenPrice(
                    transaction.owedToken,
                    transaction.heldToken,
                    transaction.owedTokenOwed,
                    orderData
                );

            // Require enough available heldToken to pay for the buyback
            require(heldTokenPrice <= transaction.availableHeldToken);
        } else {
            heldTokenPrice = transaction.availableHeldToken;
        }

        // Send the requisite heldToken to do the buyback from vault to exchange wrapper
        if (heldTokenPrice > 0) {
            Vault(state.VAULT).transferFromVault(
                transaction.positionId,
                transaction.heldToken,
                transaction.exchangeWrapper,
                heldTokenPrice
            );
        }

        // Trade the heldToken for the owedToken
        uint256 receivedOwedToken = ExchangeWrapper(transaction.exchangeWrapper).exchange(
            transaction.owedToken,
            transaction.heldToken,
            msg.sender,
            heldTokenPrice,
            orderData
        );

        require(receivedOwedToken >= transaction.owedTokenOwed);

        uint256 lenderOwedToken;

        if (transaction.payoutInHeldToken) {
            lenderOwedToken = receivedOwedToken;
        } else {
            lenderOwedToken = transaction.owedTokenOwed;
        }

        // Transfer owedToken from the exchange wrapper to the lender
        Proxy(state.PROXY).transferTokens(
            transaction.owedToken,
            transaction.exchangeWrapper,
            transaction.positionLender,
            lenderOwedToken
        );

        return (heldTokenPrice, receivedOwedToken);
    }

    function logEventOnClose(
        ClosePositionShared.CloseTx transaction,
        uint256 buybackCost,
        uint256 payout
    )
        internal
    {
        emit PositionClosed(
            transaction.positionId,
            msg.sender,
            transaction.payoutRecipient,
            transaction.closeAmount,
            transaction.originalPrincipal.sub(transaction.closeAmount),
            transaction.owedTokenOwed,
            payout,
            buybackCost,
            transaction.payoutInHeldToken
        );
    }

}
