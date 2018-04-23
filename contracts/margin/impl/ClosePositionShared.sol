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
        bytes32 positionId;
        uint256 originalPrincipal;
        uint256 closeAmount;
        uint256 owedTokenOwed;
        uint256 startingHeldToken;
        uint256 availableHeldToken;
        address payoutRecipient;
        address owedToken;
        address heldToken;
        address positionOwner;
        address positionLender;
        address exchangeWrapper;
        bool    payoutInHeldToken;
    }

    // ============ Internal Implementation Functions ============

    function closePositionStateUpdate(
        MarginState.State storage state,
        CloseTx memory transaction
    )
        internal
    {
        // Delete the position, or just decrease the principal
        if (transaction.closeAmount == transaction.originalPrincipal) {
            MarginCommon.cleanupPosition(state, transaction.positionId);
        } else {
            assert(
                transaction.originalPrincipal == state.positions[transaction.positionId].principal
            );
            state.positions[transaction.positionId].principal =
                transaction.originalPrincipal.sub(transaction.closeAmount);
        }
    }

    function sendTokensToPayoutRecipient(
        MarginState.State storage state,
        ClosePositionShared.CloseTx memory transaction,
        uint256 buybackCost,
        uint256 receivedOwedToken
    )
        internal
        returns (uint256)
    {
        uint256 payout;

        if (transaction.payoutInHeldToken) {
            // Send remaining heldToken to payoutRecipient
            payout = transaction.availableHeldToken.sub(buybackCost);

            Vault(state.VAULT).transferFromVault(
                transaction.positionId,
                transaction.heldToken,
                transaction.payoutRecipient,
                payout
            );
        } else {
            assert(transaction.exchangeWrapper != address(0));

            payout = receivedOwedToken.sub(transaction.owedTokenOwed);

            Proxy(state.PROXY).transferTokens(
                transaction.owedToken,
                transaction.exchangeWrapper,
                transaction.payoutRecipient,
                payout
            );
        }

        if (AddressUtils.isContract(transaction.payoutRecipient)) {
            require(
                PayoutRecipient(transaction.payoutRecipient).receiveClosePositionPayout(
                    transaction.positionId,
                    transaction.closeAmount,
                    msg.sender,
                    transaction.positionOwner,
                    transaction.heldToken,
                    payout,
                    transaction.availableHeldToken,
                    transaction.payoutInHeldToken
                )
            );
        }

        // The ending heldToken balance of the vault should be the starting heldToken balance
        // minus the available heldToken amount
        assert(
            Vault(state.VAULT).balances(transaction.positionId, transaction.heldToken)
            == transaction.startingHeldToken.sub(transaction.availableHeldToken)
        );

        // There should be no owed token locked in the position
        assert(
            Vault(state.VAULT).balances(transaction.positionId, transaction.owedToken) == 0
        );

        return payout;
    }

    function createCloseTx(
        MarginState.State storage state,
        bytes32 positionId,
        uint256 requestedAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool payoutInHeldToken,
        bool isLiquidation
    )
        internal
        returns (CloseTx memory)
    {
        // Validate
        require(payoutRecipient != address(0));
        require(requestedAmount > 0);

        MarginCommon.Position storage position =
            MarginCommon.getPositionFromStorage(state, positionId);

        uint256 closeAmount = getApprovedAmount(
            position,
            positionId,
            requestedAmount,
            payoutRecipient,
            isLiquidation
        );

        return parseCloseTx(
            state,
            position,
            positionId,
            closeAmount,
            payoutRecipient,
            exchangeWrapper,
            payoutInHeldToken,
            isLiquidation
        );
    }

    function parseCloseTx(
        MarginState.State storage state,
        MarginCommon.Position storage position,
        bytes32 positionId,
        uint256 closeAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool payoutInHeldToken,
        bool isLiquidation
    )
        internal
        view
        returns (CloseTx memory)
    {
        require(payoutRecipient != address(0));

        uint256 startingHeldToken = Vault(state.VAULT).balances(positionId, position.heldToken);
        uint256 availableHeldToken = MathHelpers.getPartialAmount(
            closeAmount,
            position.principal,
            startingHeldToken
        );
        uint256 owedTokenOwed = 0;
        if (!isLiquidation) {
            owedTokenOwed = MarginCommon.calculateOwedAmount(
                position,
                closeAmount,
                block.timestamp
            );
        }

        return CloseTx({
            positionId: positionId,
            originalPrincipal: position.principal,
            closeAmount: closeAmount,
            owedTokenOwed: owedTokenOwed,
            startingHeldToken: startingHeldToken,
            availableHeldToken: availableHeldToken,
            payoutRecipient: payoutRecipient,
            owedToken: position.owedToken,
            heldToken: position.heldToken,
            positionOwner: position.owner,
            positionLender: position.lender,
            exchangeWrapper: exchangeWrapper,
            payoutInHeldToken: payoutInHeldToken
        });
    }

    function getApprovedAmount(
        MarginCommon.Position storage position,
        bytes32 positionId,
        uint256 requestedAmount,
        address payoutRecipient,
        bool requireLenderApproval
    )
        internal
        returns (uint256)
    {
        uint256 newAmount = Math.min256(requestedAmount, position.principal);

        // If not the owner, requires owner to approve msg.sender
        if (position.owner != msg.sender) {
            uint256 allowedCloseAmount =
                ClosePositionDelegator(position.owner).closeOnBehalfOf(
                    msg.sender,
                    payoutRecipient,
                    positionId,
                    newAmount
                );
            require(allowedCloseAmount <= newAmount);
            newAmount = allowedCloseAmount;
        }

        // If not the lender, requires lender to approve msg.sender
        if (requireLenderApproval && position.lender != msg.sender) {
            uint256 allowedLiquidationAmount =
                LiquidatePositionDelegator(position.lender).liquidateOnBehalfOf(
                    msg.sender,
                    payoutRecipient,
                    positionId,
                    newAmount
                );
            require(allowedLiquidationAmount <= newAmount);
            newAmount = allowedLiquidationAmount;
        }

        require(newAmount > 0);
        assert(newAmount <= position.principal);
        assert(newAmount <= requestedAmount);
        return newAmount;
    }
}
