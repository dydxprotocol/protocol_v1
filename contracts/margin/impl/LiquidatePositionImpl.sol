pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ClosePositionShared } from "./ClosePositionShared.sol";
import { MarginState } from "./MarginState.sol";


/**
 * @title LiquidatePositionImpl
 * @author dYdX
 *
 * This library contains the implementation for the liquidate function of Margin
 */
library LiquidatePositionImpl {
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

    function liquidatePositionImpl(
        MarginState.State storage state,
        bytes32 positionId,
        uint256 requestedLiquidationAmount,
        address payoutRecipient
    )
        public
        returns (uint256, uint256)
    {
        ClosePositionShared.CloseTx memory transaction = ClosePositionShared.createCloseTx(
            state,
            positionId,
            requestedLiquidationAmount,
            payoutRecipient,
            address(0),
            true,
            true
        );

        uint256 heldTokenPayout = ClosePositionShared.sendTokensToPayoutRecipient(
            state,
            transaction,
            0, // No buyback cost
            0  // Did not receive any owedToken
        );

        ClosePositionShared.closePositionStateUpdate(state, transaction);

        logEventOnLiquidate(transaction);

        return (
            transaction.closeAmount,
            heldTokenPayout
        );
    }

    // ============ Helper Functions ============

    function logEventOnLiquidate(
        ClosePositionShared.CloseTx transaction
    )
        internal
    {
        emit PositionClosed(
            transaction.positionId,
            msg.sender,
            transaction.payoutRecipient,
            transaction.closeAmount,
            transaction.originalPrincipal.sub(transaction.closeAmount),
            0,
            transaction.availableHeldToken,
            0,
            true
        );
    }
}
