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
        ShortSellCommon.Short short;
        uint256 currentShortAmount;
        bytes32 shortId;
        uint256 closeAmount;
        uint256 availableQuoteToken;
        uint256 startingQuoteToken;
        address payoutRecipient;
    }

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

    function getApprovedCloseAmount(
        ShortSellCommon.Short storage short,
        bytes32 shortId,
        uint256 requestedCloseAmount,
        address payoutRecipient
    )
        internal
        returns (uint256)
    {
        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        uint256 newCloseAmount = Math.min256(requestedCloseAmount, currentShortAmount);

        // If not the short seller, requires short seller to approve msg.sender
        if (short.seller != msg.sender) {
            uint256 allowedCloseAmount =
                CloseShortDelegator(short.seller).closeOnBehalfOf(
                    msg.sender,
                    payoutRecipient,
                    shortId,
                    newCloseAmount
                );
            require(allowedCloseAmount <= newCloseAmount);
            newCloseAmount = allowedCloseAmount;
        }

        require(newCloseAmount > 0);
        assert(newCloseAmount <= currentShortAmount);
        assert(newCloseAmount <= requestedCloseAmount);
        return newCloseAmount;
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

    function parseCloseShortTx(
        ShortSellState.State storage state,
        ShortSellCommon.Short storage short,
        bytes32 shortId,
        uint256 requestedCloseAmount,
        address payoutRecipient
    )
        internal
        view
        returns (CloseShortTx memory _tx)
    {
        require(payoutRecipient != address(0));

        uint256 currentShortAmount = short.shortAmount.sub(short.closedAmount);
        uint256 closeAmount = Math.min256(requestedCloseAmount, currentShortAmount);
        uint256 startingQuoteToken = Vault(state.VAULT).balances(shortId, short.quoteToken);
        uint256 availableQuoteToken = MathHelpers.getPartialAmount(
            closeAmount,
            currentShortAmount,
            startingQuoteToken
        );

        return CloseShortTx({
            short: short,
            currentShortAmount: currentShortAmount,
            shortId: shortId,
            closeAmount: closeAmount,
            availableQuoteToken: availableQuoteToken,
            startingQuoteToken: startingQuoteToken,
            payoutRecipient: payoutRecipient
        });
    }
}
