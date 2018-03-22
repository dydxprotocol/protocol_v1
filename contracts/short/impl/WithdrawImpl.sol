pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { Proxy } from "../../shared/Proxy.sol";
import { WithdrawDelegator } from "../interfaces/WithdrawDelegator.sol";
import { CloseShortDelegator } from "../interfaces/CloseShortDelegator.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


/**
 * @title WithdrawImpl
 * @author dYdX
 *
 * This library contains the implementation for the withdraw function of ShortSell
 */
library WithdrawImpl {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A loan was withdrawn
     */
    event LoanWithdrawn(
        bytes32 indexed id,
        uint256 underlyingAmount,
        uint256 baseAmount
    );

    /**
     * A loan was partially withdrawn
     */
    event LoanPartiallyWithdrawn(
        bytes32 indexed id,
        uint256 underlyingAmount,
        uint256 remainingAmount,
        uint256 baseTokenAmount
    );

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function withdrawImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 requestedCloseAmount
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
            requestedCloseAmount,
            msg.sender
        );
        validateWithdrawal(transaction);

        // State updates
        ShortSellCommon.updateClosedAmount(state, transaction);

        // TODO: Calculate close amount in base token
        uint256 withdrawAmount = requestedCloseAmount;

        Vault vault = Vault(state.VAULT);

        vault.transferFromVault(
            shortId,
            transaction.short.baseToken,
            msg.sender,
            withdrawAmount
        );

        // The ending base token balance of the vault should be the starting base token balance
        // minus the available base token amount
        assert(
            vault.balances(shortId, transaction.short.baseToken)
            == transaction.startingBaseToken.sub(transaction.availableBaseToken)
        );

        logEventOnClose(
            transaction,
            withdrawAmount
        );

        return (
            transaction.closeAmount,
            withdrawAmount
        );
    }

    function validateWithdrawal(
        ShortSellCommon.CloseShortTx transaction
    )
        internal
    {
        // Ask the short owner how much can be closed
        uint256 allowedCloseAmount = CloseShortDelegator(transaction.short.seller).closeOnBehalfOf(
            msg.sender,
            transaction.payoutRecipient,
            transaction.shortId,
            transaction.closeAmount
        );
        transaction.closeAmount = allowedCloseAmount;

        // If not the lender, requires lender to approve msg.sender
        if (transaction.short.lender != msg.sender) {
            uint256 allowedWithdrawAmount =
                WithdrawDelegator(transaction.short.seller).withdrawOnBehalfOf(
                    msg.sender,
                    transaction.shortId,
                    transaction.closeAmount
                );

            // Because the verifier may do accounting based on the number that it returns, revert
            // if the returned amount is larger than the remaining amount of the short.
            require(transaction.closeAmount >= allowedWithdrawAmount);
            transaction.closeAmount = allowedWithdrawAmount;
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
            LoanWithdrawn(
                transaction.shortId,
                transaction.closeAmount,
                baseTokenAmount
            );
        } else {
            LoanPartiallyWithdrawn(
                transaction.shortId,
                transaction.closeAmount,
                transaction.currentShortAmount.sub(transaction.closeAmount),
                baseTokenAmount
            );
        }
    }

}
