pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { ShortSellCommon } from "./ShortSellCommon.sol";
import { ShortSellState } from "./ShortSellState.sol";
import { Vault } from "../Vault.sol";
import { Proxy } from "../../shared/Proxy.sol";
import { CloseShortDelegator } from "../interfaces/CloseShortDelegator.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";


/**
 * @title CloseShortImpl
 * @author dYdX
 *
 * This library contains the implementation for the closeShort function of ShortSell
 */
library CloseShortImpl {
    using SafeMath for uint256;

    // ------------------------
    // -------- Events --------
    // ------------------------

    /**
     * A short sell was closed
     */
    event ShortClosed(
        bytes32 indexed id,
        uint256 closeAmount,
        uint256 interestFee,
        uint256 shortSellerBaseToken,
        uint256 buybackCost
    );

    /**
     * A short sell was partially closed
     */
    event ShortPartiallyClosed(
        bytes32 indexed id,
        uint256 closeAmount,
        uint256 remainingAmount,
        uint256 interestFee,
        uint256 shortSellerBaseToken,
        uint256 buybackCost
    );

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct Order {
        address exchangeWrapperAddress;
        bytes orderData;
    }

    // -------------------------------------------
    // ----- Public Implementation Functions -----
    // -------------------------------------------

    function closeShortImpl(
        ShortSellState.State storage state,
        bytes32 shortId,
        uint256 requestedCloseAmount,
        address exchangeWrapperAddress,
        bytes orderData
    )
        public
        returns (
            uint256 _amountClosed,
            uint256 _baseTokenReceived,
            uint256 _interestFeeAmount
        )
    {
        Order memory order = Order({
            exchangeWrapperAddress: exchangeWrapperAddress,
            orderData: orderData
        });

        // Create CloseShortTx and validate closeAmount
        ShortSellCommon.CloseShortTx memory transaction = ShortSellCommon.parseCloseShortTx(state, shortId, requestedCloseAmount);
        ShortSellCommon.validateCloseShortTx(transaction); // may modify transaction

        // State updates
        ShortSellCommon.updateStateForCloseShort(state, transaction);
        uint256 interestFee = getInterestFee(transaction);

        // Send underlying tokens to lender
        uint256 buybackCost = 0;
        if (order.exchangeWrapperAddress == address(0)) {
            // no buy order; send underlying tokens directly from the closer to the lender
            Proxy(state.PROXY).transferTo(
                transaction.short.underlyingToken,
                msg.sender,
                transaction.short.lender,
                transaction.closeAmount
            );
        } else {
            // close short using buy order
            buybackCost = buyBackUnderlyingToken(
                state,
                transaction,
                order,
                shortId,
                interestFee
            );
        }

        // Send base tokens to the correct parties
        uint256 sellerBaseTokenAmount = sendBaseTokensOnClose(
            state,
            transaction,
            shortId,
            interestFee,
            buybackCost,
            msg.sender
        );

        // The ending base token balance of the vault should be the starting base token balance
        // minus the available base token amount
        assert(
            Vault(state.VAULT).balances(shortId, transaction.short.baseToken)
            == transaction.startingBaseToken.sub(transaction.availableBaseToken)
        );

        logEventOnClose(
            transaction,
            interestFee,
            buybackCost,
            sellerBaseTokenAmount
        );

        return (
            transaction.closeAmount,
            sellerBaseTokenAmount,
            interestFee
        );
    }

    function getInterestFee(
        ShortSellCommon.CloseShortTx transaction
    )
        internal
        view
        returns (uint256 _interestFee)
    {
        return ShortSellCommon.calculateInterestFee(
            transaction.short,
            transaction.closeAmount,
            block.timestamp
        );
    }

    function buyBackUnderlyingToken(
        ShortSellState.State storage state,
        ShortSellCommon.CloseShortTx transaction,
        Order order,
        bytes32 shortId,
        uint256 interestFee
    )
        internal
        returns (uint256 _buybackCost)
    {
        // Ask the exchange wrapper what the price in base token to buy back the close
        // amount of underlying token is
        uint256 baseTokenPrice = ExchangeWrapper(order.exchangeWrapperAddress).getTakerTokenPrice(
            transaction.short.underlyingToken,
            transaction.short.baseToken,
            transaction.closeAmount,
            order.orderData
        );

        // We need to have enough base token locked in the the close's vault to pay
        // for both the buyback and the interest fee
        require(baseTokenPrice.add(interestFee) <= transaction.availableBaseToken);

        // Send the requisite base token to do the buyback from vault to exchange wrapper
        if (baseTokenPrice > 0) {
            Vault(state.VAULT).transferFromVault(
                shortId,
                transaction.short.baseToken,
                order.exchangeWrapperAddress,
                baseTokenPrice
            );
        }

        // Trade the base token for the underlying token
        uint256 receivedUnderlyingToken = ExchangeWrapper(order.exchangeWrapperAddress).exchange(
            transaction.short.underlyingToken,
            transaction.short.baseToken,
            msg.sender,
            baseTokenPrice,
            order.orderData
        );


        assert(receivedUnderlyingToken == transaction.closeAmount);

        // Transfer underlying token from the exchange wrapper to the lender
        Proxy(state.PROXY).transferTo(
            transaction.short.underlyingToken,
            order.exchangeWrapperAddress,
            transaction.short.lender,
            transaction.closeAmount
        );

        return baseTokenPrice;
    }

    function sendBaseTokensOnClose(
        ShortSellState.State storage state,
        ShortSellCommon.CloseShortTx transaction,
        bytes32 shortId,
        uint256 interestFee,
        uint256 buybackCost,
        address closer
    )
        internal
        returns (uint256 _sellerBaseTokenAmount)
    {
        Vault vault = Vault(state.VAULT);

        // Send base token interest fee to lender
        if (interestFee > 0) {
            vault.transferFromVault(
                shortId,
                transaction.short.baseToken,
                transaction.short.lender,
                interestFee
            );
        }

        // Send remaining base token to closer (= availableBaseToken - buybackCost - interestFee)
        uint256 sellerBaseTokenAmount =
            transaction.availableBaseToken.sub(buybackCost).sub(interestFee);

        vault.transferFromVault(
            shortId,
            transaction.short.baseToken,
            closer,
            sellerBaseTokenAmount
        );

        return sellerBaseTokenAmount;
    }

    function logEventOnClose(
        ShortSellCommon.CloseShortTx transaction,
        uint256 interestFee,
        uint256 buybackCost,
        uint256 sellerBaseTokenAmount
    )
        internal
    {
        if (transaction.closeAmount == transaction.currentShortAmount) {
            ShortClosed(
                transaction.shortId,
                transaction.closeAmount,
                interestFee,
                sellerBaseTokenAmount,
                buybackCost
            );
        } else {
            ShortPartiallyClosed(
                transaction.shortId,
                transaction.closeAmount,
                transaction.currentShortAmount.sub(transaction.closeAmount),
                interestFee,
                sellerBaseTokenAmount,
                buybackCost
            );
        }
    }

}
