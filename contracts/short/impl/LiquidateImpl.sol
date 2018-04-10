pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { CloseShortShared } from "./CloseShortShared.sol";
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
        returns (
            uint256, // amountClosed
            uint256  // quoteTokenReceived
        )
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        uint256 liquidationAmount = CloseShortShared.getApprovedLiquidationAmount(
            short,
            shortId,
            requestedLiquidationAmount,
            payoutRecipient
        );

        CloseShortShared.CloseShortTx memory transaction = CloseShortShared.parseCloseShortTx(
            state,
            short,
            shortId,
            liquidationAmount,
            payoutRecipient
        );

        sendTokens(state, transaction);

        CloseShortShared.closeShortStateUpdate(state, transaction);

        logEventOnLiquidate(transaction);

        return (
            transaction.closeAmount,
            transaction.availableQuoteToken
        );
    }

    // --------- Helper Functions ---------

    function sendTokens(
        ShortSellState.State storage state,
        CloseShortShared.CloseShortTx transaction
    )
        internal
        returns (uint256)
    {
        Vault vault = Vault(state.VAULT);

        vault.transferFromVault(
            transaction.shortId,
            transaction.short.quoteToken,
            msg.sender,
            transaction.availableQuoteToken
        );

        // The ending quote token balance of the vault should be the starting quote token balance
        // minus the available quote token amount
        assert(
            vault.balances(transaction.shortId, transaction.short.quoteToken)
            == transaction.startingQuoteToken.sub(transaction.availableQuoteToken)
        );

        return transaction.availableQuoteToken;
    }

    function logEventOnLiquidate(
        CloseShortShared.CloseShortTx transaction
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
