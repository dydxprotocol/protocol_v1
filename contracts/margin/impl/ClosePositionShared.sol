pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Proxy } from "../Proxy.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ClosePositionDelegator } from "../interfaces/ClosePositionDelegator.sol";
import { LiquidatePositionDelegator } from "../interfaces/LiquidatePositionDelegator.sol";
import { PayoutRecipient } from "../interfaces/PayoutRecipient.sol";


/**
 * @title ClosePositionShared
 * @author dYdX
 *
 * This library contains shared functionality between ClosePositionImpl and LiquidatePositionImpl
 */
library ClosePositionShared {
    using SafeMath for uint256;

    // ============ Structs ============

    struct CloseTx {
        bytes32 marginId;
        uint256 currentPrincipal;
        uint256 closeAmount;
        uint256 baseTokenOwed;
        uint256 startingQuoteToken;
        uint256 availableQuoteToken;
        address payoutRecipient;
        address baseToken;
        address quoteToken;
        address positionOwner;
        address shortLender;
        address exchangeWrapper;
        bool    payoutInQuoteToken;
    }

    // ============ Internal Implementation Functions ============

    function closePositionStateUpdate(
        MarginState.State storage state,
        CloseTx memory transaction
    )
        internal
    {
        // Delete the position, or just increase the closedAmount
        if (transaction.closeAmount == transaction.currentPrincipal) {
            MarginCommon.cleanupPosition(state, transaction.marginId);
        } else {
            state.positions[transaction.marginId].closedAmount =
                state.positions[transaction.marginId].closedAmount.add(transaction.closeAmount);
        }
    }

    function sendQuoteTokensToPayoutRecipient(
        MarginState.State storage state,
        ClosePositionShared.CloseTx memory transaction,
        uint256 buybackCost,
        uint256 receivedBaseToken
    )
        internal
        returns (uint256)
    {
        uint256 payout;

        if (transaction.payoutInQuoteToken) {
            // Send remaining quote token to payoutRecipient
            payout = transaction.availableQuoteToken.sub(buybackCost);

            if (payout > 0) {
                Vault(state.VAULT).transferFromVault(
                    transaction.marginId,
                    transaction.quoteToken,
                    transaction.payoutRecipient,
                    payout
                );
            }
        } else {
            assert(transaction.exchangeWrapper != address(0));

            payout = receivedBaseToken.sub(transaction.baseTokenOwed);

            if (payout > 0) {
                Proxy(state.PROXY).transferTokens(
                    transaction.baseToken,
                    transaction.exchangeWrapper,
                    transaction.payoutRecipient,
                    payout
                );
            }
        }

        if (AddressUtils.isContract(transaction.payoutRecipient)) {
            require(
                PayoutRecipient(transaction.payoutRecipient).receiveClosePositionPayout(
                    transaction.marginId,
                    transaction.closeAmount,
                    msg.sender,
                    transaction.positionOwner,
                    transaction.quoteToken,
                    payout,
                    transaction.availableQuoteToken,
                    transaction.payoutInQuoteToken
                )
            );
        }

        // The ending quote token balance of the vault should be the starting quote token balance
        // minus the available quote token amount
        assert(
            Vault(state.VAULT).balances(transaction.marginId, transaction.quoteToken)
            == transaction.startingQuoteToken.sub(transaction.availableQuoteToken)
        );

        return payout;
    }

    function createCloseTx(
        MarginState.State storage state,
        bytes32 marginId,
        uint256 requestedAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool payoutInQuoteToken,
        bool isLiquidation
    )
        internal
        returns (CloseTx memory)
    {
        // Validate
        require(payoutRecipient != address(0));
        require(requestedAmount > 0);

        MarginCommon.Position storage position = MarginCommon.getPositionObject(state, marginId);

        uint256 closeAmount = getApprovedAmount(
            position,
            marginId,
            requestedAmount,
            payoutRecipient,
            isLiquidation
        );

        return parseCloseTx(
            state,
            position,
            marginId,
            closeAmount,
            payoutRecipient,
            exchangeWrapper,
            payoutInQuoteToken,
            isLiquidation
        );
    }

    function parseCloseTx(
        MarginState.State storage state,
        MarginCommon.Position storage position,
        bytes32 marginId,
        uint256 closeAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool payoutInQuoteToken,
        bool isLiquidation
    )
        internal
        view
        returns (CloseTx memory)
    {
        require(payoutRecipient != address(0));

        uint256 startingQuoteToken = Vault(state.VAULT).balances(marginId, position.quoteToken);
        uint256 currentPrincipal = position.principal.sub(position.closedAmount);
        uint256 availableQuoteToken = MathHelpers.getPartialAmount(
            closeAmount,
            currentPrincipal,
            startingQuoteToken
        );
        uint256 baseTokenOwed = 0;
        if (!isLiquidation) {
            baseTokenOwed = MarginCommon.calculateOwedAmount(
                position,
                closeAmount,
                block.timestamp
            );
        }

        return CloseTx({
            marginId: marginId,
            currentPrincipal: currentPrincipal,
            closeAmount: closeAmount,
            baseTokenOwed: baseTokenOwed,
            startingQuoteToken: startingQuoteToken,
            availableQuoteToken: availableQuoteToken,
            payoutRecipient: payoutRecipient,
            baseToken: position.baseToken,
            quoteToken: position.quoteToken,
            positionOwner: position.seller,
            shortLender: position.lender,
            exchangeWrapper: exchangeWrapper,
            payoutInQuoteToken: payoutInQuoteToken
        });
    }

    function getApprovedAmount(
        MarginCommon.Position storage position,
        bytes32 marginId,
        uint256 requestedAmount,
        address payoutRecipient,
        bool requireLenderApproval
    )
        internal
        returns (uint256)
    {
        uint256 currentPrincipal = position.principal.sub(position.closedAmount);
        uint256 newAmount = Math.min256(requestedAmount, currentPrincipal);

        // If not the short seller, requires short seller to approve msg.sender
        if (position.seller != msg.sender) {
            uint256 allowedCloseAmount = ClosePositionDelegator(position.seller).closeOnBehalfOf(
                msg.sender,
                payoutRecipient,
                marginId,
                newAmount
            );
            require(allowedCloseAmount <= newAmount);
            newAmount = allowedCloseAmount;
        }

        // If not the lender, requires lender to approve msg.sender
        if (requireLenderApproval && position.lender != msg.sender) {
            uint256 allowedLiquidationAmount = LiquidatePositionDelegator(position.lender).liquidateOnBehalfOf(
                msg.sender,
                payoutRecipient,
                marginId,
                newAmount
            );
            require(allowedLiquidationAmount <= newAmount);
            newAmount = allowedLiquidationAmount;
        }

        require(newAmount > 0);
        assert(newAmount <= currentPrincipal);
        assert(newAmount <= requestedAmount);
        return newAmount;
    }
}
