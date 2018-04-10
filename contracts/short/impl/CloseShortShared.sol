pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { CloseShortDelegator } from "../interfaces/CloseShortDelegator.sol";
import { LiquidateDelegator } from "../interfaces/LiquidateDelegator.sol";
import { PayoutRecipient } from "../interfaces/PayoutRecipient.sol";


/**
 * @title CloseShortShared
 * @author dYdX
 *
 * This library contains shared functionality between CloseShortImpl and LiquidateImpl
 */
library CloseShortShared {
    using SafeMath for uint256;

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct CloseShortTx {
        bytes32 shortId;
        uint256 currentShortAmount;
        uint256 closeAmount;
        uint256 baseTokenOwed;
        uint256 startingQuoteToken;
        uint256 availableQuoteToken;
        address payoutRecipient;
        address baseToken;
        address quoteToken;
        address shortSeller;
        address shortLender;
    }

    // -------------------------------------------
    // ---- Internal Implementation Functions ----
    // -------------------------------------------

    function closeShortStateUpdate(
        ShortSellState.State storage state,
        CloseShortTx memory transaction
    )
        internal
    {
        // Delete the short, or just increase the closedAmount
        if (transaction.closeAmount == transaction.currentShortAmount) {
            ShortSellCommon.cleanupShort(state, transaction.shortId);
        } else {
            state.shorts[transaction.shortId].closedAmount =
                state.shorts[transaction.shortId].closedAmount.add(transaction.closeAmount);
        }
    }

    function sendQuoteTokensToPayoutRecipient(
        ShortSellState.State storage state,
        CloseShortShared.CloseShortTx memory transaction,
        uint256 buybackCost
    )
        internal
        returns (uint256)
    {
        // Send remaining quote token to payoutRecipient
        uint256 quoteTokenPayout = transaction.availableQuoteToken.sub(buybackCost);

        Vault(state.VAULT).transferFromVault(
            transaction.shortId,
            transaction.quoteToken,
            transaction.payoutRecipient,
            quoteTokenPayout
        );

        if (AddressUtils.isContract(transaction.payoutRecipient)) {
            PayoutRecipient(transaction.payoutRecipient).receiveCloseShortPayout(
                transaction.shortId,
                transaction.closeAmount,
                msg.sender,
                transaction.shortSeller,
                transaction.quoteToken,
                quoteTokenPayout,
                transaction.availableQuoteToken
            );
        }

        // The ending quote token balance of the vault should be the starting quote token balance
        // minus the available quote token amount
        assert(
            Vault(state.VAULT).balances(transaction.shortId, transaction.quoteToken)
            == transaction.startingQuoteToken.sub(transaction.availableQuoteToken)
        );

        return quoteTokenPayout;
    }

    function createCloseShortTx(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 requestedAmount,
        address payoutRecipient,
        bool isLiquidation
    )
        internal
        returns (CloseShortTx memory)
    {
        ShortSellCommon.Short storage short = ShortSellCommon.getShortObject(state, shortId);

        uint256 closeAmount = getApprovedAmount(
            short,
            shortId,
            requestedAmount,
            payoutRecipient,
            isLiquidation
        );

        return parseCloseShortTx(
            state,
            short,
            shortId,
            closeAmount,
            payoutRecipient,
            isLiquidation
        );
    }

    function parseCloseShortTx(
        ShortSellState.State storage state,
        ShortSellCommon.Short storage short,
        bytes32 shortId,
        uint256 closeAmount,
        address payoutRecipient,
        bool isLiquidation
    )
        internal
        view
        returns (CloseShortTx memory)
    {
        require(payoutRecipient != address(0));

        uint256 startingQuoteToken = Vault(state.VAULT).balances(shortId, short.quoteToken);
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        uint256 availableQuoteToken = MathHelpers.getPartialAmount(
            closeAmount,
            currentShortAmount,
            startingQuoteToken
        );
        uint256 baseTokenOwed = 0;
        if (!isLiquidation) {
            baseTokenOwed = ShortSellCommon.calculateOwedAmount(
                short,
                closeAmount,
                block.timestamp
            );
        }

        return CloseShortTx({
            shortId: shortId,
            currentShortAmount: currentShortAmount,
            closeAmount: closeAmount,
            baseTokenOwed: baseTokenOwed,
            startingQuoteToken: startingQuoteToken,
            availableQuoteToken: availableQuoteToken,
            payoutRecipient: payoutRecipient,
            baseToken: short.baseToken,
            quoteToken: short.quoteToken,
            shortSeller: short.seller,
            shortLender: short.lender
        });
    }

    function getApprovedAmount(
        ShortSellCommon.Short storage short,
        bytes32 shortId,
        uint256 requestedAmount,
        address payoutRecipient,
        bool requireLenderApproval
    )
        internal
        returns (uint256)
    {
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        uint256 newAmount = Math.min256(requestedAmount, currentShortAmount);

        // If not the short seller, requires short seller to approve msg.sender
        if (short.seller != msg.sender) {
            uint256 allowedCloseAmount = CloseShortDelegator(short.seller).closeOnBehalfOf(
                msg.sender,
                payoutRecipient,
                shortId,
                newAmount
            );
            require(allowedCloseAmount <= newAmount);
            newAmount = allowedCloseAmount;
        }

        // If not the lender, requires lender to approve msg.sender
        if (requireLenderApproval && short.lender != msg.sender) {
            uint256 allowedLiquidationAmount = LiquidateDelegator(short.lender).liquidateOnBehalfOf(
                msg.sender,
                payoutRecipient,
                shortId,
                newAmount
            );
            require(allowedLiquidationAmount <= newAmount);
            newAmount = allowedLiquidationAmount;
        }

        require(newAmount > 0);
        assert(newAmount <= currentShortAmount);
        assert(newAmount <= requestedAmount);
        return newAmount;
    }
}
