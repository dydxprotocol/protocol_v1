pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { Proxy } from "../Proxy.sol";
import { LiquidateDelegator } from "../interfaces/LiquidateDelegator.sol";
import { CloseShortDelegator } from "../interfaces/CloseShortDelegator.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


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
        uint256 liquidatedAmount,
        uint256 remainingAmount,
        uint256 quoteAmount
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function liquidateImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 requestedLiquidationAmount
    )
        public
        returns (
            uint256, // amountClosed
            uint256  // quoteTokenReceived
        )
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        uint256 liquidationAmount = getApprovedLiquidationAmount(
            short,
            shortId,
            requestedLiquidationAmount,
            msg.sender
        );

        ShortSellCommon.CloseShortTx memory transaction = ShortSellCommon.parseCloseShortTx(
            state,
            short,
            shortId,
            liquidationAmount,
            msg.sender
        );

        Vault vault = Vault(state.VAULT);

        vault.transferFromVault(
            shortId,
            transaction.short.quoteToken,
            msg.sender,
            transaction.availableQuoteToken
        );

        // The ending quote token balance of the vault should be the starting quote token balance
        // minus the available quote token amount
        assert(
            vault.balances(shortId, transaction.short.quoteToken)
            == transaction.startingQuoteToken.sub(transaction.availableQuoteToken)
        );

        // Delete the short, or just increase the closedAmount
        if (transaction.closeAmount == transaction.currentShortAmount) {
            ShortSellCommon.cleanupShort(state, transaction.shortId);
        } else {
            short.closedAmount = short.closedAmount.add(transaction.closeAmount);
        }

        logEventOnLiquidate(transaction);

        return (
            transaction.closeAmount,
            transaction.availableQuoteToken
        );
    }

    function getApprovedLiquidationAmount(
        ShortSellCommon.Short storage short,
        bytes32 shortId,
        uint256 requestedLiquidationAmount,
        address payoutRecipient
    )
        internal
        returns (uint256)
    {
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        uint256 newLiquidationAmount = Math.min256(requestedLiquidationAmount, currentShortAmount);

        // If not the short seller, requires short seller to approve msg.sender
        if (short.seller != msg.sender) {
            uint256 allowedCloseAmount =
                CloseShortDelegator(short.seller).closeOnBehalfOf(
                    msg.sender,
                    payoutRecipient,
                    shortId,
                    newLiquidationAmount
                );
            require(allowedCloseAmount <= newLiquidationAmount);
            newLiquidationAmount = allowedCloseAmount;
        }

        // If not the lender, requires lender to approve msg.sender
        if (short.lender != msg.sender) {
            uint256 allowedLiquidationAmount =
                LiquidateDelegator(short.lender).liquidateOnBehalfOf(
                    msg.sender,
                    shortId,
                    newLiquidationAmount
                );
            require(allowedLiquidationAmount <= newLiquidationAmount);
            newLiquidationAmount = allowedLiquidationAmount;
        }

        require(newLiquidationAmount > 0);
        assert(newLiquidationAmount <= currentShortAmount);
        assert(newLiquidationAmount <= requestedLiquidationAmount);
        return newLiquidationAmount;
    }

    function logEventOnLiquidate(
        ShortSellCommon.CloseShortTx transaction
    )
        internal
    {
        emit LoanLiquidated(
            transaction.shortId,
            msg.sender,
            transaction.closeAmount,
            transaction.currentShortAmount.sub(transaction.closeAmount),
            transaction.availableQuoteToken
        );
    }

}
