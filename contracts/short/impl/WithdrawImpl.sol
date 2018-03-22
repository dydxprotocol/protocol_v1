pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { Proxy } from "../../shared/Proxy.sol";
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
        ShortSellCommon.validateCloseShortTx(transaction); // may modify transaction

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
