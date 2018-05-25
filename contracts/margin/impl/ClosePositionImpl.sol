/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.24;
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
     * A position was closed or partially closed
     */
    event PositionClosed(
        bytes32 indexed positionId,
        address indexed closer,
        address indexed payoutRecipient,
        uint256 closeAmount,
        uint256 remainingAmount,
        uint256 owedTokenPaidToLender,
        uint256 payoutAmount,
        uint256 buybackCostInHeldToken,
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

        (
            uint256 buybackCostInHeldToken,
            uint256 receivedOwedToken
        ) = returnOwedTokensToLender(
            state,
            transaction,
            orderData
        );

        uint256 payout = ClosePositionShared.sendTokensToPayoutRecipient(
            state,
            transaction,
            buybackCostInHeldToken,
            receivedOwedToken
        );

        ClosePositionShared.closePositionStateUpdate(state, transaction);

        logEventOnClose(
            transaction,
            buybackCostInHeldToken,
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
        uint256 buybackCostInHeldToken = 0;
        uint256 receivedOwedToken = 0;
        uint256 lenderOwedToken = transaction.owedTokenOwed;

        if (transaction.exchangeWrapper == address(0)) {
            require(
                transaction.payoutInHeldToken,
                "ClosePositionImpl#returnOwedTokensToLender: Cannot payout in owedToken"
            );

            // No DEX Order; send owedTokens directly from the closer to the lender
            Proxy(state.PROXY).transferTokens(
                transaction.owedToken,
                msg.sender,
                transaction.positionLender,
                lenderOwedToken
            );
        } else {
            // Buy back owedTokens using DEX Order and send to lender
            (buybackCostInHeldToken, receivedOwedToken) = buyBackOwedToken(
                state,
                transaction,
                orderData
            );

            // If no owedToken needed for payout: give lender all owedToken, even if more than owed
            if (transaction.payoutInHeldToken) {
                assert(receivedOwedToken >= lenderOwedToken);
                lenderOwedToken = receivedOwedToken;
            }

            // Transfer owedToken from the exchange wrapper to the lender
            Proxy(state.PROXY).transferTokens(
                transaction.owedToken,
                transaction.exchangeWrapper,
                transaction.positionLender,
                lenderOwedToken
            );
        }

        state.totalOwedTokenRepaidToLender[transaction.positionId] =
            state.totalOwedTokenRepaidToLender[transaction.positionId].add(lenderOwedToken);

        return (buybackCostInHeldToken, receivedOwedToken);
    }

    function buyBackOwedToken(
        MarginState.State storage state,
        ClosePositionShared.CloseTx transaction,
        bytes memory orderData
    )
        internal
        returns (uint256, uint256)
    {
        uint256 buybackCostInHeldToken;
        uint256 receivedOwedToken;

        Vault(state.VAULT).transferFromVault(
            transaction.positionId,
            transaction.heldToken,
            transaction.exchangeWrapper,
            transaction.availableHeldToken
        );

        if (transaction.payoutInHeldToken) {
            receivedOwedToken = transaction.owedTokenOwed;
            buybackCostInHeldToken = ExchangeWrapper(transaction.exchangeWrapper).exchangeBuy(
                transaction.owedToken,
                transaction.heldToken,
                msg.sender,
                transaction.owedTokenOwed,
                orderData
            );

            require(
                buybackCostInHeldToken <= transaction.availableHeldToken,
                "ClosePositionImpl#buyBackOwedToken: Spent too much heldToken"
            );

            Vault(state.VAULT).transferToVault(
                transaction.positionId,
                transaction.heldToken,
                transaction.exchangeWrapper,
                transaction.availableHeldToken.sub(buybackCostInHeldToken)
            );
        } else {
            buybackCostInHeldToken = transaction.availableHeldToken;
            receivedOwedToken = ExchangeWrapper(transaction.exchangeWrapper).exchangeSell(
                transaction.owedToken,
                transaction.heldToken,
                msg.sender,
                transaction.availableHeldToken,
                orderData
            );

            require(
                receivedOwedToken >= transaction.owedTokenOwed,
                "ClosePositionImpl#buyBackOwedToken: Did not receive enough owedToken"
            );
        }

        return (buybackCostInHeldToken, receivedOwedToken);
    }

    function logEventOnClose(
        ClosePositionShared.CloseTx transaction,
        uint256 buybackCostInHeldToken,
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
            buybackCostInHeldToken,
            transaction.payoutInHeldToken
        );
    }

}
