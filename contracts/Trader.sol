pragma solidity 0.4.15;

import './lib/AccessControlled.sol';
import './lib/SafeMath.sol';
import './interfaces/ERC20.sol';
import './interfaces/ZeroExExchange.sol';
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

    address public DYDX_EXCHANGE;
    address public ZERO_EX_EXCHANGE;
    address public VAULT;
    address public PROXY;
    address public ZERO_EX_FEE_TOKEN_CONSTANT;

    function Trader(
        address _dydxExchange,
        address _0xExchange,
        address _vault,
        address _proxy,
        address _0xFeeTokenConstant
    ) AccessControlled(ACCESS_DELAY, GRACE_PERIOD) {
        DYDX_EXCHANGE = _dydxExchange;
        ZERO_EX_EXCHANGE = _0xExchange;
        VAULT = _vault;
        PROXY = _proxy;
        ZERO_EX_FEE_TOKEN_CONSTANT = _0xFeeTokenConstant;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    function updateDydxExchange(address _dydxExchange) onlyOwner {
        DYDX_EXCHANGE = _dydxExchange;
    }

    function update0xExchange(address _0xExchange) onlyOwner {
        ZERO_EX_EXCHANGE = _0xExchange;
    }

    function updateVault(address _vault) onlyOwner {
        VAULT = _vault;
    }

    function updateProxy(address _proxy) onlyOwner {
        PROXY = _proxy;
    }

    function update0xFeeTokenConstant(address _0xFeeTokenConstant) onlyOwner {
        ZERO_EX_FEE_TOKEN_CONSTANT = _0xFeeTokenConstant;
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
        uint[3] memory startingBalances = [
            ERC20(orderAddresses[3]).balanceOf(address(this)),
            ERC20(orderAddresses[2]).balanceOf(address(this)),
            ERC20(orderAddresses[6]).balanceOf(address(this))
        ];

        transferTokensBeforeTrade(
            id,
            orderAddresses,
            orderValues,
            requestedFillAmount
        );

        // Do the trade
        uint filledTakerTokenAmount = doTrade(
            orderAddresses,
            orderValues,
            requestedFillAmount,
            v,
            r,
            s
        );

        uint makerTokenAmount = updateBalancesForTrade(
            id,
            orderAddresses,
            filledTakerTokenAmount,
            requestedFillAmount,
            orderValues,
            requireFullAmount
        );

        // Assert the token balances have not changed
        validateBalances(startingBalances, orderAddresses);

        return (filledTakerTokenAmount, makerTokenAmount);
    }

    // --------------------------------
    // ------ Internal Functions ------
    // --------------------------------

    function doTrade(
        address[7] orderAddresses,
        uint[6] orderValues,
        uint requestedFillAmount,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal returns (
        uint _filledTakerTokenAmount
    ) {
        // If the maker fee token address is a special reserved constant then
        // Use the official 0x exchange contract. Otherwise use dydx's general exchange contract
        if (orderAddresses[5] == ZERO_EX_FEE_TOKEN_CONSTANT) {
            return ZeroExExchange(ZERO_EX_EXCHANGE).fillOrder(
                [
                    orderAddresses[0],
                    orderAddresses[1],
                    orderAddresses[2],
                    orderAddresses[3],
                    orderAddresses[4]
                ],
                orderValues,
                requestedFillAmount,
                true,
                v,
                r,
                s
            );
        }

        return Exchange(DYDX_EXCHANGE).fillOrder(
            orderAddresses,
            orderValues,
            requestedFillAmount,
            true,
            v,
            r,
            s
        );
    }

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
            ERC20(orderAddresses[3]).approve(PROXY, requestedFillAmount);

            if (feeAmount > 0) {
                Vault(VAULT).send(
                    id,
                    orderAddresses[6],
                    address(this),
                    feeAmount
                );
                ERC20(orderAddresses[6]).approve(PROXY, feeAmount);
            }
        }
    }

    function updateBalancesForTrade(
        bytes32 id,
        address[7] orderAddresses,
        uint filledTakerTokenAmount,
        uint requestedFillAmount,
        uint[6] orderValues,
        bool requireFullAmount
    ) internal returns (
        uint _receivedMakerTokenAmount
    ) {
        address makerTokenAddress = orderAddresses[2];
        address takerTokenAddress = orderAddresses[3];
        address takerFeeTokenAddress = orderAddresses[6];

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

        return makerTokenAmount;
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

        // Transfer any leftover taker/fee token back to the vault
        if (extraTakerTokenAmount > 0) {
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

                if (extraTakerFeeTokenAmount > 0) {
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
    }

    function validateBalances(
        uint[3] startingBalances,
        address[7] orderAddresses
    ) internal {
        assert(
            ERC20(orderAddresses[3]).balanceOf(address(this)) == startingBalances[0]
        );
        assert(
            ERC20(orderAddresses[2]).balanceOf(address(this)) == startingBalances[1]
        );
        assert(
            ERC20(orderAddresses[6]).balanceOf(address(this)) == startingBalances[2]
        );
    }
}
