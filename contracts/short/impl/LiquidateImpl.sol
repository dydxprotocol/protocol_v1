pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { CloseShortShared } from "./CloseShortShared.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


/**
 * @title LiquidateImpl
 * @author dYdX
 *
 * This library contains the implementation for the liquidate function of ShortSell
 */
library LiquidateImpl {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A loan was liquidated
     */
    event LoanLiquidated(
        bytes32 indexed id,
        address indexed liquidator,
        address indexed payoutRecipient,
        uint256 liquidatedAmount,
        uint256 remainingAmount,
        uint256 quoteTokenPayout
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function liquidateImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 requestedLiquidationAmount,
        address payoutRecipient
    )
        public
        returns (uint256, uint256)
    {
        CloseShortShared.CloseShortTx memory transaction = CloseShortShared.createCloseShortTx(
            state,
            shortId,
            requestedLiquidationAmount,
            payoutRecipient,
            true
        );

        uint256 quoteTokenPayout = CloseShortShared.sendQuoteTokensToPayoutRecipient(
            state,
            transaction,
            0 // No buyback cost
        );

        CloseShortShared.closeShortStateUpdate(state, transaction);

        logEventOnLiquidate(transaction);

        return (
            transaction.closeAmount,
            quoteTokenPayout
        );
    }

    // --------- Helper Functions ---------

    function logEventOnLiquidate(
        CloseShortShared.CloseShortTx transaction
    )
        internal
    {
        emit LoanLiquidated(
            transaction.shortId,
            msg.sender,
            transaction.payoutRecipient,
            transaction.closeAmount,
            transaction.currentShortAmount.sub(transaction.closeAmount),
            transaction.availableQuoteToken
        );
    }

}
