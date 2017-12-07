pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/ownership/HasNoEther.sol';
import 'zeppelin-solidity/contracts/ownership/HasNoContracts.sol';
import '../lib/AccessControlled.sol';
import '../lib/TokenInteract.sol';
import '../lib/DelayedUpdate.sol';
import '../interfaces/ZeroExExchangeInterface.sol';
import '../shared/Exchange.sol';
import '../shared/Proxy.sol';
import './Vault.sol';

/**
 * @title Trader
 * @author Antonio Juliano
 *
 * This contract is used to abstract the exchange of token assets from Vault
 */
contract Trader is
    AccessControlled,
    TokenInteract,
    DelayedUpdate,
    HasNoEther,
    HasNoContracts {
    struct Order {
        address maker;
        address taker;
        address makerToken;
        address takerToken;
        address feeRecipient;
        address makerFeeToken;
        address takerFeeToken;
        uint makerTokenAmount;
        uint takerTokenAmount;
        uint makerFee;
        uint takerFee;
        uint expirationTimestampInSec;
        bool is0xOrder;
    }

    struct StartingBalances {
        uint takerTokenBalance;
        uint makerTokenBalance;
        uint takerFeeTokenBalance;
    }

    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    address public DYDX_EXCHANGE;
    address public ZERO_EX_EXCHANGE;
    address public VAULT;
    address public PROXY;
    address public ZERO_EX_PROXY;
    address public ZERO_EX_FEE_TOKEN_CONSTANT;

    function Trader(
        address _dydxExchange,
        address _0xExchange,
        address _vault,
        address _proxy,
        address _0xProxy,
        address _0xFeeTokenConstant,
        uint _accessDelay,
        uint _gracePeriod,
        uint _updateDelay,
        uint _updateExpiration
    )
        AccessControlled(_accessDelay, _gracePeriod)
        DelayedUpdate(_updateDelay, _updateExpiration)
        public
    {
        DYDX_EXCHANGE = _dydxExchange;
        ZERO_EX_EXCHANGE = _0xExchange;
        VAULT = _vault;
        PROXY = _proxy;
        ZERO_EX_PROXY = _0xProxy;
        ZERO_EX_FEE_TOKEN_CONSTANT = _0xFeeTokenConstant;
    }

    // -----------------------------
    // ------ Admin Functions ------
    // -----------------------------

    function updateDydxExchange(address _dydxExchange)
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("DYDX_EXCHANGE", _dydxExchange)
        external
    {
        DYDX_EXCHANGE = _dydxExchange;
    }

    function update0xExchange(address _0xExchange)
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("0X_EXCHANGE", _0xExchange)
        external
    {
        ZERO_EX_EXCHANGE = _0xExchange;
    }

    function updateVault(address _vault)
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("VAULT", _vault)
        external
    {
        VAULT = _vault;
    }

    function updateProxy(address _proxy)
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("PROXY", _proxy)
        external
    {
        PROXY = _proxy;
    }

    function update0xProxy(address _0xProxy)
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("0X_PROXY", _0xProxy)
        external
    {
        ZERO_EX_PROXY = _0xProxy;
    }

    function update0xFeeTokenConstant(address _0xFeeTokenConstant)
        onlyOwner // Must come before delayedAddressUpdate
        delayedAddressUpdate("0X_FEE_TOKEN_CONSTANT", _0xFeeTokenConstant)
        external
    {
        ZERO_EX_FEE_TOKEN_CONSTANT = _0xFeeTokenConstant;
    }

    // -----------------------------------------
    // ---- Public State Changing Functions ----
    // -----------------------------------------

    function trade(
        bytes32 id,
        address[7] orderAddresses,
        uint[6] orderValues,
        uint requestedFillAmount,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bool requireFullAmount
    ) requiresAuthorization external returns (
        uint _filledTakerTokenAmount,
        uint _makerTokenAmount
    ) {
        Order memory order = Order({
            maker: orderAddresses[0],
            taker: orderAddresses[1],
            makerToken: orderAddresses[2],
            takerToken: orderAddresses[3],
            feeRecipient: orderAddresses[4],
            makerFeeToken: orderAddresses[5],
            takerFeeToken: orderAddresses[6],
            makerTokenAmount: orderValues[0],
            takerTokenAmount: orderValues[1],
            makerFee: orderValues[2],
            takerFee: orderValues[3],
            expirationTimestampInSec: orderValues[4],
            is0xOrder: orderAddresses[5] == ZERO_EX_FEE_TOKEN_CONSTANT
        });

        StartingBalances memory startingBalances = StartingBalances({
            takerTokenBalance: balanceOf(order.takerToken, address(this)),
            makerTokenBalance: balanceOf(order.makerToken, address(this)),
            takerFeeTokenBalance: order.feeRecipient == address(0) ?
                                    0 : balanceOf(order.takerFeeToken, address(this))
        });

        transferTokensBeforeTrade(
            id,
            order,
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

        uint makerTokenAmount = returnTokens(
            id,
            order,
            filledTakerTokenAmount,
            requestedFillAmount,
            requireFullAmount
        );

        // Assert the token balances have not changed
        validateBalances(startingBalances, order);

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
            return ZeroExExchangeInterface(ZERO_EX_EXCHANGE).fillOrder(
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
        Order order,
        uint requestedFillAmount
    ) internal {
        require(order.makerToken != order.takerToken);

        uint feeAmount;

        address proxy;

        if (order.is0xOrder) {
            proxy = ZERO_EX_PROXY;
        } else {
            proxy = PROXY;
        }

        // These transfers will fail on insufficient vault balance
        if (order.feeRecipient == address(0)) {
            // If the fee recipient is 0, no fee is required so just transfer the taker token
            Vault(VAULT).send(
                id,
                order.takerToken,
                address(this),
                requestedFillAmount
            );

            // Approve transfer of taker token by proxy for trade
            setAllowance(order.takerToken, proxy, requestedFillAmount);
        } else if (order.takerToken == order.takerFeeToken) {
            // If the taker token is the same as taker fee token, just transfer ithem together
            feeAmount = getPartialAmount(
                requestedFillAmount,
                order.takerTokenAmount,
                order.takerFee
            );

            uint totalAmount = add(requestedFillAmount, feeAmount);

            Vault(VAULT).send(
                id,
                order.takerToken,
                address(this),
                totalAmount
            );

            setAllowance(order.takerToken, proxy, totalAmount);
        } else {
            // If the taker token and taker fee token are different, transfer them separately
            feeAmount = getPartialAmount(
                requestedFillAmount,
                order.takerTokenAmount,
                order.takerFee
            );

            Vault(VAULT).send(
                id,
                order.takerToken,
                address(this),
                requestedFillAmount
            );
            setAllowance(order.takerToken, proxy, requestedFillAmount);

            if (feeAmount > 0) {
                Vault(VAULT).send(
                    id,
                    order.takerFeeToken,
                    address(this),
                    feeAmount
                );
                setAllowance(order.takerFeeToken, proxy, feeAmount);
            }
        }
    }

    function returnTokens(
        bytes32 id,
        Order order,
        uint filledTakerTokenAmount,
        uint requestedFillAmount,
        bool requireFullAmount
    ) internal returns (
        uint _receivedMakerTokenAmount
    ) {
        // 0 can indicate an error
        require(filledTakerTokenAmount > 0);

        if (requireFullAmount) {
            require(requestedFillAmount == filledTakerTokenAmount);
        }

        uint makerTokenAmount = getPartialAmount(
            order.makerTokenAmount,
            order.takerTokenAmount,
            filledTakerTokenAmount
        );
        uint paidTakerFee = getPartialAmount(
            filledTakerTokenAmount,
            order.takerTokenAmount,
            order.takerFee
        );
        uint requestedTakerFee = getPartialAmount(
            requestedFillAmount,
            order.takerTokenAmount,
            order.takerFee
        );

        uint extraTakerTokenAmount = sub(requestedFillAmount, filledTakerTokenAmount);
        uint extraTakerFeeTokenAmount = sub(requestedTakerFee, paidTakerFee);

        transferBackTokens(
            id,
            order,
            makerTokenAmount,
            extraTakerTokenAmount,
            extraTakerFeeTokenAmount
        );

        return makerTokenAmount;
    }

    function transferBackTokens(
        bytes32 id,
        Order order,
        uint receivedMakerTokenAmount,
        uint extraTakerTokenAmount,
        uint extraTakerFeeTokenAmount
    ) internal {
        // Transfer the received maker token back to vault
        setAllowance(order.makerToken, PROXY, receivedMakerTokenAmount);
        Vault(VAULT).transfer(
            id,
            order.makerToken,
            address(this),
            receivedMakerTokenAmount
        );

        // Transfer any leftover taker/fee token back to the vault
        if (extraTakerTokenAmount > 0) {
            if (order.takerFeeToken == address(0)) {
                // If there is no fee, just transfer the extra taker token back
                setAllowance(order.takerToken, PROXY, extraTakerTokenAmount);
                Vault(VAULT).transfer(
                    id,
                    order.takerToken,
                    address(this),
                    extraTakerTokenAmount
                );
            } else if (order.takerToken == order.takerFeeToken) {
                // If the fee token is the same as the taker token, transfer extras back together
                uint totalAmount = add(extraTakerTokenAmount, extraTakerFeeTokenAmount);

                setAllowance(order.takerToken, PROXY, extraTakerTokenAmount);
                Vault(VAULT).transfer(
                    id,
                    order.takerToken,
                    address(this),
                    totalAmount
                );
            } else {
                // If the fee token is different than the taker token,
                // transfer extras back separately

                setAllowance(order.takerToken, PROXY, extraTakerTokenAmount);
                Vault(VAULT).transfer(
                    id,
                    order.takerToken,
                    address(this),
                    extraTakerTokenAmount
                );

                if (extraTakerFeeTokenAmount > 0) {
                    setAllowance(order.takerFeeToken, PROXY, extraTakerFeeTokenAmount);
                    Vault(VAULT).transfer(
                        id,
                        order.takerFeeToken,
                        address(this),
                        extraTakerFeeTokenAmount
                    );
                }
            }
        }
    }

    function validateBalances(
        StartingBalances startingBalances,
        Order order
    ) internal view {
        assert(
            balanceOf(order.takerToken, address(this)) == startingBalances.takerTokenBalance
        );
        assert(
            balanceOf(order.makerToken, address(this)) == startingBalances.makerTokenBalance
        );
        if (order.feeRecipient != address(0)) {
            assert(
                balanceOf(order.takerFeeToken, address(this))
                    == startingBalances.takerFeeTokenBalance
            );
        }
    }
}
