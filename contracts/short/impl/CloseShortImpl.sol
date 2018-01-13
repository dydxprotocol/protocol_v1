pragma solidity 0.4.18;

import "zeppelin-solidity/contracts/ReentrancyGuard.sol";
import "./ShortSellState.sol";
import "./ShortSellEvents.sol";
import "../Vault.sol";


/**
 * @title CloseShortImpl
 * @author Antonio Juliano
 *
 * This contract contains the implementation for the closeShort function of ShortSell
 */
contract CloseShortImpl is
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
        external
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
                closeId,
                transaction.orderValues,
                transaction.orderAddresses[4],
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

        assert(
            Vault(VAULT).balances(
                closeId, transaction.short.underlyingToken
            ) == transaction.closeAmount
        );

        // Assert fee token balance is 0 (orderAddresses[4] is the takerFeeToken)
        assert(Vault(VAULT).balances(closeId, transaction.orderAddresses[4]) == 0);

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
        bytes32 closeId,
        uint[6] orderValues,
        address takerFeeToken,
        uint baseTokenPrice
    )
        internal
    {
        // takerFee = buyOrderTakerFee * (baseTokenPrice / buyOrderBaseTokenAmount)
        uint takerFee = getPartialAmount(
            baseTokenPrice,
            orderValues[1],
            orderValues[3]
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
