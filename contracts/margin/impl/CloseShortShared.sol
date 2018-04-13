pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { AddressUtils } from "zeppelin-solidity/contracts/AddressUtils.sol";
import { Math } from "zeppelin-solidity/contracts/math/Math.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { MarginCommon } from "./MarginCommon.sol";
import { MarginState } from "./MarginState.sol";
import { Proxy } from "../Proxy.sol";
import { Vault } from "../Vault.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
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
        address exchangeWrapper;
        bool    payoutInQuoteToken;
    }

    // -------------------------------------------
    // ---- Internal Implementation Functions ----
    // -------------------------------------------

    function closeShortStateUpdate(
        MarginState.State storage state,
        CloseShortTx memory transaction
    )
        internal
    {
        // Delete the short, or just increase the closedAmount
        if (transaction.closeAmount == transaction.currentShortAmount) {
            MarginCommon.cleanupShort(state, transaction.shortId);
        } else {
            state.shorts[transaction.shortId].closedAmount =
                state.shorts[transaction.shortId].closedAmount.add(transaction.closeAmount);
        }
    }

    function sendQuoteTokensToPayoutRecipient(
        MarginState.State storage state,
        CloseShortShared.CloseShortTx memory transaction,
        uint256 buybackCost,
        uint256 receivedBaseToken
    )
        internal
        returns (uint256)
    {
        uint256 payout;

        if (transaction.payoutInQuoteToken) {
            // Send remaining quote token to payoutRecipient
            payout = transaction.availableQuoteToken.sub(buybackCost);

            if (payout > 0) {
                Vault(state.VAULT).transferFromVault(
                    transaction.shortId,
                    transaction.quoteToken,
                    transaction.payoutRecipient,
                    payout
                );
            }
        } else {
            assert(transaction.exchangeWrapper != address(0));

            payout = receivedBaseToken.sub(transaction.baseTokenOwed);

            if (payout > 0) {
                Proxy(state.PROXY).transferTokens(
                    transaction.baseToken,
                    transaction.exchangeWrapper,
                    transaction.payoutRecipient,
                    payout
                );
            }
        }

        if (AddressUtils.isContract(transaction.payoutRecipient)) {
            require(
                PayoutRecipient(transaction.payoutRecipient).receiveCloseShortPayout(
                    transaction.shortId,
                    transaction.closeAmount,
                    msg.sender,
                    transaction.shortSeller,
                    transaction.quoteToken,
                    payout,
                    transaction.availableQuoteToken,
                    transaction.payoutInQuoteToken
                )
            );
        }

        // The ending quote token balance of the vault should be the starting quote token balance
        // minus the available quote token amount
        assert(
            Vault(state.VAULT).balances(transaction.shortId, transaction.quoteToken)
            == transaction.startingQuoteToken.sub(transaction.availableQuoteToken)
        );

        return payout;
    }

    function createCloseShortTx(
        MarginState.State storage state,
        bytes32 shortId,
        uint256 requestedAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool payoutInQuoteToken,
        bool isLiquidation
    )
        internal
        returns (CloseShortTx memory)
    {
        // Validate
        require(payoutRecipient != address(0));
        require(requestedAmount > 0);

        MarginCommon.Short storage short = MarginCommon.getShortObject(state, shortId);

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
            exchangeWrapper,
            payoutInQuoteToken,
            isLiquidation
        );
    }

    function parseCloseShortTx(
        MarginState.State storage state,
        MarginCommon.Short storage short,
        bytes32 shortId,
        uint256 closeAmount,
        address payoutRecipient,
        address exchangeWrapper,
        bool payoutInQuoteToken,
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
            baseTokenOwed = MarginCommon.calculateOwedAmount(
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
            shortLender: short.lender,
            exchangeWrapper: exchangeWrapper,
            payoutInQuoteToken: payoutInQuoteToken
        });
    }

    function getApprovedAmount(
        MarginCommon.Short storage short,
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
