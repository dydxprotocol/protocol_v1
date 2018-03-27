pragma solidity 0.4.19;

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
        uint256 liquidatedAmount,
        uint256 baseAmount
    );

    /**
     * A loan was partially liquidated
     */
    event LoanPartiallyLiquidated(
        bytes32 indexed id,
        uint256 liquidatedAmount,
        uint256 remainingAmount,
        uint256 baseAmount
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
            uint256 _amountClosed,
            uint256 _baseTokenReceived
        )
    {
        // Create CloseShortTx and validate closeAmount
        ShortSellCommon.CloseShortTx memory transaction = ShortSellCommon.parseCloseShortTx(
            state,
            shortId,
            requestedLiquidationAmount,
            msg.sender
        );
        validateLiquidation(transaction);

        // State updates
        ShortSellCommon.updateClosedAmount(state, transaction);

        uint256 liquidateAmount = transaction.availableBaseToken;

        Vault vault = Vault(state.VAULT);

        vault.transferFromVault(
            shortId,
            transaction.short.baseToken,
            msg.sender,
            liquidateAmount
        );

        // The ending base token balance of the vault should be the starting base token balance
        // minus the available base token amount
        assert(
            vault.balances(shortId, transaction.short.baseToken)
            == transaction.startingBaseToken.sub(transaction.availableBaseToken)
        );

        logEventOnClose(
            transaction,
            liquidateAmount
        );

        return (
            transaction.closeAmount,
            liquidateAmount
        );
    }

    function validateLiquidation(
        ShortSellCommon.CloseShortTx transaction
    )
        internal
    {
        // If not the short seller, requires short seller to approve msg.sender
        if (msg.sender != transaction.short.seller) {
            uint256 allowedCloseAmount = CloseShortDelegator(transaction.short.seller).closeOnBehalfOf(
                msg.sender,
                transaction.payoutRecipient,
                transaction.shortId,
                transaction.closeAmount
            );
            // Because the verifier may do accounting based on the number that it returns, revert
            // if the returned amount is larger than the remaining amount of the short.
            require(transaction.closeAmount >= allowedCloseAmount);
            transaction.closeAmount = allowedCloseAmount;
        }

        // If not the lender, requires lender to approve msg.sender
        if (transaction.short.lender != msg.sender) {
            uint256 allowedLiquidationAmount =
                LiquidateDelegator(transaction.short.lender).liquidateOnBehalfOf(
                    msg.sender,
                    transaction.shortId,
                    transaction.closeAmount
                );

            // Because the verifier may do accounting based on the number that it returns, revert
            // if the returned amount is larger than the remaining amount of the short.
            require(transaction.closeAmount >= allowedLiquidationAmount);
            transaction.closeAmount = allowedLiquidationAmount;
        }

        require(transaction.closeAmount > 0);
        require(transaction.closeAmount <= transaction.currentShortAmount);
    }

    function logEventOnClose(
        ShortSellCommon.CloseShortTx transaction,
        uint256 baseTokenAmount
    )
        internal
    {
        if (transaction.closeAmount == transaction.currentShortAmount) {
            LoanLiquidated(
                transaction.shortId,
                transaction.closeAmount,
                baseTokenAmount
            );
        } else {
            LoanPartiallyLiquidated(
                transaction.shortId,
                transaction.closeAmount,
                transaction.currentShortAmount.sub(transaction.closeAmount),
                baseTokenAmount
            );
        }
    }

}
