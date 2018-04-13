pragma solidity 0.4.21;
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
     * A position was liquidated
     */
    event PositionLiquidated(
        bytes32 indexed marginId,
        address indexed liquidator,
        address indexed payoutRecipient,
        uint256 liquidatedAmount,
        uint256 remainingAmount,
        uint256 quoteTokenPayout
    );

    // ============ Public Implementation Functions ============

    function liquidatePositionImpl(
        MarginState.State storage state,
        bytes32 marginId,
        uint256 requestedLiquidationAmount,
        address payoutRecipient
    )
        public
        returns (uint256, uint256)
    {
        ClosePositionShared.CloseTx memory transaction = ClosePositionShared.createCloseTx(
            state,
            marginId,
            requestedLiquidationAmount,
            payoutRecipient,
            true
        );

        uint256 quoteTokenPayout = ClosePositionShared.sendQuoteTokensToPayoutRecipient(
            state,
            transaction,
            0 // No buyback cost
        );

        ClosePositionShared.ClosePositionStateUpdate(state, transaction);

        logEventOnLiquidate(transaction);

        return (
            transaction.closeAmount,
            quoteTokenPayout
        );
    }

    // ============ Helper Functions ============

    function logEventOnLiquidate(
        ClosePositionShared.CloseTx memory transaction
    )
        internal
    {
        emit PositionLiquidated(
            transaction.marginId,
            msg.sender,
            transaction.payoutRecipient,
            transaction.closeAmount,
            transaction.currentPositionAmount.sub(transaction.closeAmount),
            transaction.availableQuoteToken
        );
    }

}
