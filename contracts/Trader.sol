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
        address[5] orderAddresses,
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
        validateAndApproveTrade(
            id,
            orderAddresses,
            requestedFillAmount
        );

        uint startingMakerTokenBalance = ERC20(orderAddresses[2]).balanceOf(address(this));
        uint startingTakerTokenBalance = ERC20(orderAddresses[3]).balanceOf(address(this));

        Vault vault = Vault(VAULT);

        // Take the required amount of taker token from vault
        vault.send(
            id,
            orderAddresses[3],
            address(this),
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
            filledTakerTokenAmount,
            requestedFillAmount,
            orderValues,
            requireFullAmount
        );
    }

    // -------------------------------------
    // ----- Public Constant Functions -----
    // -------------------------------------

    function getPartialAmount(
        uint numerator,
        uint denominator,
        uint target
    ) constant public returns (
        uint partialValue
    ) {
        return safeDiv(safeMul(numerator, target), denominator);
    }

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    function validateAndApproveTrade(
        bytes32 id,
        address[5] orderAddresses,
        uint requestedFillAmount
    ) internal {
        // Do not allow maker token and taker token to be the same
        require(orderAddresses[2] != orderAddresses[3]);

        Vault vault = Vault(VAULT);
        require(vault.balances[id][orderAddresses[3]] >= requestedFillAmount);
        assert(vault.totalBalances[orderAddresses[3]] >= requestedFillAmount);

        // Approve transfer of taker token by proxy for trade
        ERC20(orderAddresses[3]).approve(PROXY, requestedFillAmount);
    }

    function updateBalancesForTrade(
        bytes32 id,
        address makerTokenAddress,
        address takerTokenAddress,
        uint filledTakerTokenAmount,
        uint requestedFillAmount,
        uint[6] orderValues,
        bool requireFullAmount,
        uint startingMakerTokenAmount,
        uint startingTakerTokenAmount
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
        uint takerFee = getPartialAmount(filledTakerTokenAmount, orderValues[1], orderValues[3]);

        uint receivedMakerTokenAmount = safeSub(makerTokenAmount, takerFee);
        uint extraTakerTokenAmount = safeSub(requestedFillAmount, filledTakerTokenAmount);

        ERC20 makerToken = ERC20(makerTokenAddress);
        ERC20 takerToken = ERC20(takerTokenAddress);

        assert(
            makerToken.balanceOf(address(this))
            == safeAdd(startingMakerTokenAmount, receivedMakerTokenAmount)
        );
        assert(
            takerToken.balanceOf(address(this))
            == safeAdd(startingTakerTokenAmount, extraTakerTokenAmount)
        );

        // Transfer the received maker token back to vault
        makerToken.approve(PROXY, receivedMakerTokenAmount);
        Vault(VAULT).transfer(
            id,
            makerTokenAddress,
            address(this),
            receivedMakerTokenAmount
        );

        // Transfer any leftover taker token back to the vault
        if (extraTakerTokenAmount != 0) {
            takerToken.approve(PROXY, extraTakerTokenAmount);
            Vault(VAULT).transfer(
                id,
                takerTokenAddress,
                address(this),
                extraTakerTokenAmount
            );
        }

        return (filledTakerTokenAmount, receivedMakerTokenAmount);
    }
}
