pragma solidity 0.4.18;

import { ReentrancyGuard } from "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import { ShortCommonHelperFunctions } from "./ShortCommonHelperFunctions.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { ShortSellEvents } from "./ShortSellEvents.sol";
import { Vault } from "../Vault.sol";
import { Trader } from "../Trader.sol";
import { ShortSellRepo } from "../ShortSellRepo.sol";
import { SafeMath } from "../../lib/SafeMath.sol";


/**
 * @title CloseShortImpl
 * @author Antonio Juliano
 *
 * This contract contains the implementation for the closeShort function of ShortSell
 */
 /* solium-disable-next-line */
contract CloseShortImpl is
    SafeMath,
    ShortSellState,
    ShortSellEvents,
    ReentrancyGuard,
    ShortCommonHelperFunctions {

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct CloseShortTx {
        Short short;
        uint currentShortAmount;
        bytes32 shortId;
        uint closeAmount;
        address[5] orderAddresses;
        uint[6] orderValues;
        uint8 orderV;
        bytes32 orderR;
        bytes32 orderS;
    }

    // -------------------------------------------
    // ---- Internal Implementation Functions ----
    // -------------------------------------------

    function closeShortImpl(
        bytes32 shortId,
        uint closeAmount,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    )
        internal
        nonReentrant
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        CloseShortTx memory transaction = parseCloseShortTx(
            shortId,
            closeAmount,
            orderAddresses,
            orderValues,
            orderV,
            orderR,
            orderS
        );

        require(closeAmount > 0);

        validateCloseShort(transaction);

        // STATE UPDATES

        // Remove short if it's fully closed, or update the closed amount
        updateStateForCloseShort(transaction);

        // EXTERNAL CALLS

        var (interestFee, buybackCost, sellerBaseTokenAmount) = buybackAndSendOnClose(
            transaction
        );

        logEventOnClose(
            transaction,
            interestFee,
            buybackCost,
            sellerBaseTokenAmount
        );

        return (
            sellerBaseTokenAmount,
            interestFee
        );
    }

    function closeEntireShortImpl(
        bytes32 shortId,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    )
        internal
        // nonReentrant not needed as closeShortImpl uses state variable
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        Short memory short = getShortObject(shortId);

        return closeShortImpl(
            shortId,
            short.shortAmount,
            orderAddresses,
            orderValues,
            orderV,
            orderR,
            orderS
        );
    }

    function closeShortDirectlyImpl(
        bytes32 shortId,
        uint closeAmount
    )
        internal
        nonReentrant
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        Short memory short = getShortObject(shortId);
        uint currentShortAmount = sub(short.shortAmount, short.closedAmount);

        require(short.seller == msg.sender);
        require(closeAmount <= currentShortAmount);
        require(closeAmount > 0);

        // The amount of interest fee owed to close this proportion of the position
        uint interestFee = calculateInterestFee(
            short,
            closeAmount,
            block.timestamp
        );

        // First transfer base token used for close into new vault. Vault will then validate
        // this is the maximum base token that can be used by this close
        // Prefer to use a new vault, so this close cannot touch the rest of the
        // funds held in the original short vault
        bytes32 closeId = transferToCloseVault(
            short,
            shortId,
            closeAmount
        );

        // STATE UPDATES

        // If the whole short is closed, remove it from repo
        if (closeAmount == currentShortAmount) {
            cleanupShort(
                shortId
            );
        } else {
            // Otherwise increment the closed amount on the short
            ShortSellRepo(REPO).setShortClosedAmount(
                shortId,
                add(short.closedAmount, closeAmount)
            );
        }

        // EXTERNAL CALLS
        Vault(VAULT).transfer(
            closeId,
            short.underlyingToken,
            msg.sender,
            closeAmount
        );

        uint sellerBaseTokenAmount = sendTokensOnClose(
            short,
            closeId,
            closeAmount,
            interestFee
        );

        if (closeAmount == currentShortAmount) {
            // If the whole short is closed and there is an auction offer, send it back
            payBackAuctionBidderIfExists(
                shortId,
                short
            );

            ShortClosed(
                shortId,
                interestFee,
                closeAmount,
                sellerBaseTokenAmount,
                0,
                block.timestamp
            );
        } else {
            ShortPartiallyClosed(
                shortId,
                closeAmount,
                sub(currentShortAmount, closeAmount),
                interestFee,
                sellerBaseTokenAmount,
                0,
                block.timestamp
            );
        }

        return (
            sellerBaseTokenAmount,
            interestFee
        );
    }

    function closeEntireShortDirectlyImpl(
        bytes32 shortId
    )
        internal
        // nonReentrant not needed as closeShortDirectlyImpl uses state variable
        returns (
            uint _baseTokenReceived,
            uint _interestFeeAmount
        )
    {
        Short memory short = getShortObject(shortId);

        return closeShortDirectlyImpl(
            shortId,
            short.shortAmount
        );
    }

    // --------- Helper Functions ---------

    function validateCloseShort(
        CloseShortTx transaction
    )
        internal
        view
    {
        require(transaction.short.seller == msg.sender);
        require(transaction.closeAmount <= transaction.currentShortAmount);
    }

    function updateStateForCloseShort(
        CloseShortTx transaction
    )
        internal
    {
        // If the whole short is closed, remove it from repo
        if (transaction.closeAmount == transaction.currentShortAmount) {
            cleanupShort(
                transaction.shortId
            );
        } else {
            // Otherwise increment the closed amount on the short
            ShortSellRepo(REPO).setShortClosedAmount(
                transaction.shortId,
                add(transaction.short.closedAmount, transaction.closeAmount)
            );
        }
    }

    function buybackAndSendOnClose(
        CloseShortTx transaction
    )
        internal
        returns (
            uint _interestFee,
            uint _buybackCost,
            uint _sellerBaseTokenAmount
        )
    {
        // The amount of interest fee owed to close this proportion of the position
        uint interestFee = calculateInterestFee(
            transaction.short,
            transaction.closeAmount,
            block.timestamp
        );

        // First transfer base token used for close into new vault. Vault will then validate
        // this is the maximum base token that can be used by this close
        // Prefer to use a new vault, so this close cannot touch the rest of the
        // funds held in the original short vault
        bytes32 closeId = transferToCloseVault(
            transaction.short,
            transaction.shortId,
            transaction.closeAmount
        );

        uint buybackCost = buyBackUnderlyingToken(
            transaction,
            closeId,
            interestFee
        );

        uint sellerBaseTokenAmount = sendTokensOnClose(
            transaction.short,
            closeId,
            transaction.closeAmount,
            interestFee
        );

        if (transaction.closeAmount == transaction.currentShortAmount) {
            // If the whole short is closed and there is an auction offer, send it back
            payBackAuctionBidderIfExists(
                transaction.shortId,
                transaction.short
            );
        }

        return (
            interestFee,
            buybackCost,
            sellerBaseTokenAmount
        );
    }

    function buyBackUnderlyingToken(
        CloseShortTx transaction,
        bytes32 closeId,
        uint interestFee
    )
        internal
        returns (uint _buybackCost)
    {
        uint baseTokenPrice = getBaseTokenPriceForBuyback(
            transaction.short,
            transaction.closeAmount,
            interestFee,
            closeId,
            transaction.orderValues
        );

        if (transaction.orderAddresses[2] != address(0)) {
            transferFeeForBuyback(
                transaction,
                closeId,
                baseTokenPrice
            );
        }

        var (buybackCost, ) = Trader(TRADER).trade(
            closeId,
            [
                transaction.orderAddresses[0],
                transaction.orderAddresses[1],
                transaction.short.underlyingToken,
                transaction.short.baseToken,
                transaction.orderAddresses[2],
                transaction.orderAddresses[3],
                transaction.orderAddresses[4]
            ],
            transaction.orderValues,
            baseTokenPrice,
            transaction.orderV,
            transaction.orderR,
            transaction.orderS,
            true
        );

        // Should now hold exactly closeAmount of underlying token
        assert(
            Vault(VAULT).balances(
                closeId, transaction.short.underlyingToken
            ) == transaction.closeAmount
        );

        address takerFeeToken = transaction.orderAddresses[4];

        // Assert take fee token balance is 0. The only cases where it should not be 0
        // is if it is either baseToken or underlyingToken
        if (
            takerFeeToken != transaction.short.baseToken
            && takerFeeToken != transaction.short.underlyingToken
        ) {
            assert(Vault(VAULT).balances(closeId, takerFeeToken) == 0);
        }

        return buybackCost;
    }

    function getBaseTokenPriceForBuyback(
        Short short,
        uint closeAmount,
        uint interestFee,
        bytes32 closeId,
        uint[6] orderValues
    )
        internal
        view
        returns (uint _baseTokenPrice)
    {
        // baseTokenPrice = closeAmount * (buyOrderBaseTokenAmount / buyOrderUnderlyingTokenAmount)
        uint baseTokenPrice = getPartialAmount(
            orderValues[1],
            orderValues[0],
            closeAmount
        );

        // We need to have enough base token locked in the the close's vault to pay
        // for both the buyback and the interest fee
        require(
            add(baseTokenPrice, interestFee) <= Vault(VAULT).balances(closeId, short.baseToken)
        );

        return baseTokenPrice;
    }

    function transferFeeForBuyback(
        CloseShortTx transaction,
        bytes32 closeId,
        uint baseTokenPrice
    )
        internal
    {
        address takerFeeToken = transaction.orderAddresses[4];

        // If the taker fee token is base token, then just pay it out of what is held in Vault
        // and do not transfer it in from the short seller
        if (transaction.short.baseToken == takerFeeToken) {
            return;
        }

        uint buyOrderTakerFee = transaction.orderValues[3];
        uint buyOrderTakerTokenAmount = transaction.orderValues[1];

        // takerFee = buyOrderTakerFee * (baseTokenPrice / buyOrderBaseTokenAmount)
        uint takerFee = getPartialAmount(
            baseTokenPrice,
            buyOrderTakerTokenAmount,
            buyOrderTakerFee
        );

        // Transfer taker fee for buyback
        if (takerFee > 0) {
            Vault(VAULT).transfer(
                closeId,
                takerFeeToken,
                msg.sender,
                takerFee
            );
        }
    }

    function sendTokensOnClose(
        Short short,
        bytes32 closeId,
        uint closeAmount,
        uint interestFee
    )
        internal
        returns (uint _sellerBaseTokenAmount)
    {
        Vault vault = Vault(VAULT);

        // Send original loaned underlying token to lender
        vault.send(
            closeId,
            short.underlyingToken,
            short.lender,
            closeAmount
        );

        // Send base token interest fee to lender
        if (interestFee > 0) {
            vault.send(
                closeId,
                short.baseToken,
                short.lender,
                interestFee
            );
        }

        // Send remaining base token to seller (= deposit + profit - interestFee)
        // Also note if the takerFeeToken on the sell order is baseToken, that fee will also
        // have been paid out of the vault balance
        uint sellerBaseTokenAmount = vault.balances(closeId, short.baseToken);
        vault.send(
            closeId,
            short.baseToken,
            short.seller,
            sellerBaseTokenAmount
        );

        // Should now hold no balance of base or underlying token
        assert(vault.balances(closeId, short.underlyingToken) == 0);
        assert(vault.balances(closeId, short.baseToken) == 0);

        return sellerBaseTokenAmount;
    }

    function logEventOnClose(
        CloseShortTx transaction,
        uint interestFee,
        uint buybackCost,
        uint sellerBaseTokenAmount
    )
        internal
    {
        if (transaction.closeAmount == transaction.currentShortAmount) {
            ShortClosed(
                transaction.shortId,
                transaction.closeAmount,
                interestFee,
                sellerBaseTokenAmount,
                buybackCost,
                block.timestamp
            );
        } else {
            ShortPartiallyClosed(
                transaction.shortId,
                transaction.closeAmount,
                sub(transaction.currentShortAmount, transaction.closeAmount),
                interestFee,
                sellerBaseTokenAmount,
                buybackCost,
                block.timestamp
            );
        }
    }

    // -------- Parsing Functions -------

    function parseCloseShortTx(
        bytes32 shortId,
        uint closeAmount,
        address[5] orderAddresses,
        uint[6] orderValues,
        uint8 orderV,
        bytes32 orderR,
        bytes32 orderS
    )
        internal
        view
        returns (CloseShortTx _tx)
    {
        Short memory short = getShortObject(shortId);
        return CloseShortTx({
            short: short,
            currentShortAmount: sub(short.shortAmount, short.closedAmount),
            shortId: shortId,
            closeAmount: closeAmount,
            orderAddresses: orderAddresses,
            orderValues: orderValues,
            orderV: orderV,
            orderR: orderR,
            orderS: orderS
        });
    }
}
