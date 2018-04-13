pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
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
        uint256 currentPositionAmount;
        uint256 closeAmount;
        uint256 baseTokenOwed;
        uint256 startingQuoteToken;
        uint256 availableQuoteToken;
        address payoutRecipient;
        address baseToken;
        address quoteToken;
        address positionOwner;
        address positionLender;
    }

    // ============ Internal Implementation Functions ============

    function ClosePositionStateUpdate(
        MarginState.State storage state,
        CloseTx memory transaction
    )
        internal
    {
        assert(transaction.closeAmount <= transaction.currentPositionAmount);

        // Delete the margin position, or just increase the closedAmount
        if (transaction.closeAmount == transaction.currentPositionAmount) {
            MarginCommon.cleanupPosition(state, transaction.marginId);
        } else {
            state.positions[transaction.marginId].closedAmount =
                state.positions[transaction.marginId].closedAmount.add(
                    transaction.closeAmount
                );
        }
    }

    function sendQuoteTokensToPayoutRecipient(
        MarginState.State storage state,
        ClosePositionShared.CloseTx memory transaction,
        uint256 buybackCost
    )
        internal
        returns (uint256)
    {
        // Send remaining quote token to payoutRecipient
        uint256 quoteTokenPayout = transaction.availableQuoteToken.sub(buybackCost);

        Vault(state.VAULT).transferFromVault(
            transaction.marginId,
            transaction.quoteToken,
            transaction.payoutRecipient,
            quoteTokenPayout
        );

        if (AddressUtils.isContract(transaction.payoutRecipient)) {
            require(
                PayoutRecipient(transaction.payoutRecipient).receiveClosePositionPayout(
                    transaction.marginId,
                    transaction.closeAmount,
                    msg.sender,
                    transaction.positionOwner,
                    transaction.quoteToken,
                    quoteTokenPayout,
                    transaction.availableQuoteToken
                )
            );
        }

        // The ending quote token balance of the vault should be the starting quote token balance
        // minus the available quote token amount
        assert(
            Vault(state.VAULT).balances(transaction.marginId, transaction.quoteToken)
            == transaction.startingQuoteToken.sub(transaction.availableQuoteToken)
        );

        return quoteTokenPayout;
    }

    function createCloseTx(
        MarginState.State storage state,
        bytes32 marginId,
        uint256 requestedAmount,
        address payoutRecipient,
        bool isLiquidation
    )
        internal
        returns (CloseTx memory)
    {
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
            isLiquidation
        );
    }

    function parseCloseTx(
        MarginState.State storage state,
        MarginCommon.Position storage position,
        bytes32 marginId,
        uint256 closeAmount,
        address payoutRecipient,
        bool isLiquidation
    )
        internal
        view
        returns (CloseTx memory)
    {
        require(payoutRecipient != address(0));

        uint256 startingQuoteToken = Vault(state.VAULT).balances(marginId, position.quoteToken);
        uint256 currentPositionAmount = position.amount.sub(position.closedAmount);
        uint256 availableQuoteToken = MathHelpers.getPartialAmount(
            closeAmount,
            currentPositionAmount,
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
            currentPositionAmount: currentPositionAmount,
            closeAmount: closeAmount,
            baseTokenOwed: baseTokenOwed,
            startingQuoteToken: startingQuoteToken,
            availableQuoteToken: availableQuoteToken,
            payoutRecipient: payoutRecipient,
            baseToken: position.baseToken,
            quoteToken: position.quoteToken,
            positionOwner: position.owner,
            positionLender: position.lender
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
        uint256 currentPositionAmount = position.amount.sub(position.closedAmount);
        uint256 newAmount = Math.min256(requestedAmount, currentPositionAmount);

        // If not the owner, require owner to approve msg.sender
        if (position.owner != msg.sender) {
            uint256 allowedCloseAmount =
                ClosePositionDelegator(position.owner).closePositionOnBehalfOf(
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
            uint256 allowedLiquidationAmount =
                LiquidatePositionDelegator(position.lender).liquidatePositionOnBehalfOf(
                    msg.sender,
                    payoutRecipient,
                    marginId,
                    newAmount
                );
            require(allowedLiquidationAmount <= newAmount);
            newAmount = allowedLiquidationAmount;
        }

        require(newAmount > 0);
        assert(newAmount <= currentPositionAmount);
        assert(newAmount <= requestedAmount);
        return newAmount;
    }
}
