pragma solidity 0.4.15;

import './lib/AccessControlled.sol';
import './lib/SafeMath.sol';
import './interfaces/ERC20.sol';
import './Exchange.sol';
import './Vault.sol';
import './Proxy.sol';

/**
 * @title Trader
 * @author Antonio Juliano
 *
 * This contract is used to abstract the exchange of token assets from Vault
 */
contract Trader is AccessControlled, SafeMath {
    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    uint public constant ACCESS_DELAY = 1 days;
    uint public constant GRACE_PERIOD = 8 hours;

    address public EXCHANGE;
    address public VAULT;
    address public PROXY;

    function Trader(
        address _exchange,
        address _vault,
        address _proxy
    ) AccessControlled(ACCESS_DELAY, GRACE_PERIOD) {
        EXCHANGE = _exchange;
        VAULT = _vault;
        PROXY = _proxy;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    function updateExchange(address _exchange) onlyOwner {
        EXCHANGE = _exchange;
    }

    function updateVault(address _vault) onlyOwner {
        VAULT = _vault;
    }

    function updateProxy(address _proxy) onlyOwner {
        PROXY = _proxy;
    }

    function trade(
        bytes32 id,
        address[7] orderAddresses,
        uint[6] orderValues,
        uint requestedFillAmount,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bool requireFullAmount
    ) requiresAuthorization returns (
        uint _filledTakerTokenAmount,
        uint _makerTokenAmount
    ) {
        transferTokensBeforeTrade(
            id,
            orderAddresses,
            orderValues,
            requestedFillAmount
        );

        // Do the trade
        uint filledTakerTokenAmount = Exchange(EXCHANGE).fillOrder(
            orderAddresses,
            orderValues,
            requestedFillAmount,
            true,
            v,
            r,
            s
        );

        return updateBalancesForTrade(
            id,
            orderAddresses[2],
            orderAddresses[3],
            orderAddresses[6],
            filledTakerTokenAmount,
            requestedFillAmount,
            orderValues,
            requireFullAmount
        );
    }

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    function transferTokensBeforeTrade(
        bytes32 id,
        address[7] orderAddresses,
        uint[6] orderValues,
        uint requestedFillAmount
    ) internal {
        require(orderAddresses[2] != orderAddresses[3]);

        uint feeAmount;

        // These transfers will fail on insufficient vault balance
        if (orderAddresses[4] == address(0)) {
            Vault(VAULT).send(
                id,
                orderAddresses[3],
                address(this),
                requestedFillAmount
            );

            // Approve transfer of taker token by proxy for trade
            ERC20(orderAddresses[3]).approve(PROXY, requestedFillAmount);
        } else if (orderAddresses[3] == orderAddresses[6]) {
            feeAmount = getPartialAmount(
                requestedFillAmount,
                orderValues[1],
                orderValues[3]
            );

            uint totalAmount = safeAdd(requestedFillAmount, feeAmount);

            Vault(VAULT).send(
                id,
                orderAddresses[3],
                address(this),
                totalAmount
            );

            ERC20(orderAddresses[3]).approve(PROXY, totalAmount);
        } else {
            feeAmount = getPartialAmount(
                requestedFillAmount,
                orderValues[1],
                orderValues[3]
            );

            Vault(VAULT).send(
                id,
                orderAddresses[3],
                address(this),
                requestedFillAmount
            );

            Vault(VAULT).send(
                id,
                orderAddresses[6],
                address(this),
                feeAmount
            );

            ERC20(orderAddresses[3]).approve(PROXY, requestedFillAmount);
            ERC20(orderAddresses[6]).approve(PROXY, feeAmount);
        }
    }

    function updateBalancesForTrade(
        bytes32 id,
        address makerTokenAddress,
        address takerTokenAddress,
        address takerFeeTokenAddress,
        uint filledTakerTokenAmount,
        uint requestedFillAmount,
        uint[6] orderValues,
        bool requireFullAmount
    ) internal returns (
        uint _filledTakerTokenAmount,
        uint _receivedMakerTokenAmount
    ) {
        // 0 can indicate an error
        require(filledTakerTokenAmount > 0);

        if (requireFullAmount) {
            require(requestedFillAmount == filledTakerTokenAmount);
        }

        uint makerTokenAmount = getPartialAmount(
            orderValues[0],
            orderValues[1],
            filledTakerTokenAmount
        );
        uint paidTakerFee = getPartialAmount(
            filledTakerTokenAmount,
            orderValues[1],
            orderValues[3]
        );
        uint requestedTakerFee = getPartialAmount(
            requestedFillAmount,
            orderValues[1],
            orderValues[3]
        );

        uint extraTakerTokenAmount = safeSub(requestedFillAmount, filledTakerTokenAmount);
        uint extraTakerFeeTokenAmount = safeSub(requestedTakerFee, paidTakerFee);

        transferBackTokens(
            id,
            makerTokenAddress,
            takerTokenAddress,
            takerFeeTokenAddress,
            makerTokenAmount,
            extraTakerTokenAmount,
            extraTakerFeeTokenAmount
        );

        return (filledTakerTokenAmount, makerTokenAmount);
    }

    function transferBackTokens(
        bytes32 id,
        address makerTokenAddress,
        address takerTokenAddress,
        address takerFeeTokenAddress,
        uint receivedMakerTokenAmount,
        uint extraTakerTokenAmount,
        uint extraTakerFeeTokenAmount
    ) internal {
        // Transfer the received maker token back to vault
        ERC20(makerTokenAddress).approve(PROXY, receivedMakerTokenAmount);
        Vault(VAULT).transfer(
            id,
            makerTokenAddress,
            address(this),
            receivedMakerTokenAmount
        );

        // Transfer any leftover taker token back to the vault
        if (extraTakerTokenAmount != 0) {
            ERC20(takerTokenAddress).approve(PROXY, extraTakerTokenAmount);
            Vault(VAULT).transfer(
                id,
                takerTokenAddress,
                address(this),
                extraTakerTokenAmount
            );
        }

        if (takerFeeTokenAddress == address(0)) {
            ERC20(takerTokenAddress).approve(PROXY, extraTakerTokenAmount);
            Vault(VAULT).transfer(
                id,
                takerTokenAddress,
                address(this),
                extraTakerTokenAmount
            );
        } else if (takerTokenAddress == takerFeeTokenAddress) {
            uint totalAmount = safeAdd(extraTakerTokenAmount, extraTakerFeeTokenAmount);

            ERC20(takerTokenAddress).approve(PROXY, extraTakerTokenAmount);
            Vault(VAULT).transfer(
                id,
                takerTokenAddress,
                address(this),
                totalAmount
            );
        } else {
            ERC20(takerTokenAddress).approve(PROXY, extraTakerTokenAmount);
            Vault(VAULT).transfer(
                id,
                takerTokenAddress,
                address(this),
                extraTakerTokenAmount
            );

            ERC20(takerTokenAddress).approve(PROXY, extraTakerTokenAmount);
            Vault(VAULT).transfer(
                id,
                takerFeeTokenAddress,
                address(this),
                extraTakerFeeTokenAmount
            );
        }
    }
}
