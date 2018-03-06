pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { StaticAccessControlled } from "../lib/StaticAccessControlled.sol";
import { TokenInteract } from "../lib/TokenInteract.sol";
import { ZeroExExchangeInterface } from "../interfaces/ZeroExExchangeInterface.sol";
import { Exchange } from "../shared/Exchange.sol";
import { Proxy } from "../shared/Proxy.sol";
import { Vault } from "./vault/Vault.sol";
import { MathHelpers } from "../lib/MathHelpers.sol";


/**
 * @title Trader
 * @author dYdX
 *
 * This contract is used to abstract the exchange of token assets from Vault
 */
/* solium-disable-next-line */
contract Trader is
    StaticAccessControlled,
    TokenInteract,
    HasNoEther,
    HasNoContracts {
    using SafeMath for uint256;

    // -----------------------
    // ------- Structs -------
    // -----------------------

    struct Order {
        address maker;
        address taker;
        address makerToken;
        address takerToken;
        address feeRecipient;
        address makerFeeToken;
        address takerFeeToken;
        uint256 makerTokenAmount;
        uint256 takerTokenAmount;
        uint256 makerFee;
        uint256 takerFee;
        uint256 expirationTimestampInSec;
        bool is0xOrder;
    }

    struct StartingBalances {
        uint256 takerTokenBalance;
        uint256 makerTokenBalance;
        uint256 takerFeeTokenBalance;
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

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function Trader(
        address _dydxExchange,
        address _0xExchange,
        address _vault,
        address _proxy,
        address _0xProxy,
        address _0xFeeTokenConstant,
        uint256 _gracePeriod
    )
        StaticAccessControlled(_gracePeriod)
        public
    {
        DYDX_EXCHANGE = _dydxExchange;
        ZERO_EX_EXCHANGE = _0xExchange;
        VAULT = _vault;
        PROXY = _proxy;
        ZERO_EX_PROXY = _0xProxy;
        ZERO_EX_FEE_TOKEN_CONSTANT = _0xFeeTokenConstant;
    }

    // --------------------------------------------------
    // ---- Authorized Only State Changing Functions ----
    // --------------------------------------------------

    function trade(
        bytes32 id,
        address[7] orderAddresses,
        uint256[6] orderValues,
        uint256 requestedFillAmount,
        uint8 v,
        bytes32 r,
        bytes32 s,
        bool requireFullAmount
    )
        requiresAuthorization
        external
        returns (
            uint256 _filledTakerTokenAmount,
            uint256 _makerTokenAmount
        )
    {
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
        uint256 filledTakerTokenAmount = doTrade(
            orderAddresses,
            orderValues,
            requestedFillAmount,
            v,
            r,
            s
        );

        uint256 makerTokenAmount = returnTokens(
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
        uint256[6] orderValues,
        uint256 requestedFillAmount,
        uint8 v,
        bytes32 r,
        bytes32 s
    )
        internal
        returns (uint256 _filledTakerTokenAmount)
    {
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
        uint256 requestedFillAmount
    )
        internal
    {
        require(order.makerToken != order.takerToken);

        uint256 feeAmount;

        address proxy;

        if (order.is0xOrder) {
            proxy = ZERO_EX_PROXY;
        } else {
            proxy = PROXY;
        }

        // These transfers will fail on insufficient vault balance
        if (order.feeRecipient == address(0)) {
            // If the fee recipient is 0, no fee is required so just transfer the taker token
            Vault(VAULT).withdrawFromVault(
                id,
                order.takerToken,
                requestedFillAmount
            );

            // Approve transfer of taker token by proxy for trade
            setAllowance(order.takerToken, proxy, requestedFillAmount);
        } else if (order.takerToken == order.takerFeeToken) {
            // If the taker token is the same as taker fee token, just transfer them together
            feeAmount = MathHelpers.getPartialAmount(
                requestedFillAmount,
                order.takerTokenAmount,
                order.takerFee
            );

            uint256 totalAmount = requestedFillAmount.add(feeAmount);

            Vault(VAULT).withdrawFromVault(
                id,
                order.takerToken,
                totalAmount
            );

            setAllowance(order.takerToken, proxy, totalAmount);
        } else {
            // If the taker token and taker fee token are different, transfer them separately
            feeAmount = MathHelpers.getPartialAmount(
                requestedFillAmount,
                order.takerTokenAmount,
                order.takerFee
            );

            Vault(VAULT).withdrawFromVault(
                id,
                order.takerToken,
                requestedFillAmount
            );
            setAllowance(order.takerToken, proxy, requestedFillAmount);

            if (feeAmount > 0) {
                Vault(VAULT).withdrawFromVault(
                    id,
                    order.takerFeeToken,
                    feeAmount
                );
                setAllowance(order.takerFeeToken, proxy, feeAmount);
            }
        }
    }

    function returnTokens(
        bytes32 id,
        Order order,
        uint256 filledTakerTokenAmount,
        uint256 requestedFillAmount,
        bool requireFullAmount
    )
        internal
        returns (uint256 _receivedMakerTokenAmount)
    {
        // 0 can indicate an error
        require(filledTakerTokenAmount > 0);

        if (requireFullAmount) {
            require(requestedFillAmount == filledTakerTokenAmount);
        }

        uint256 makerTokenAmount = MathHelpers.getPartialAmount(
            order.makerTokenAmount,
            order.takerTokenAmount,
            filledTakerTokenAmount
        );
        uint256 paidTakerFee = MathHelpers.getPartialAmount(
            filledTakerTokenAmount,
            order.takerTokenAmount,
            order.takerFee
        );
        uint256 requestedTakerFee = MathHelpers.getPartialAmount(
            requestedFillAmount,
            order.takerTokenAmount,
            order.takerFee
        );

        uint256 extraTakerTokenAmount = requestedFillAmount.sub(filledTakerTokenAmount);
        uint256 extraTakerFeeTokenAmount = requestedTakerFee.sub(paidTakerFee);

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
        uint256 receivedMakerTokenAmount,
        uint256 extraTakerTokenAmount,
        uint256 extraTakerFeeTokenAmount
    )
        internal
    {
        // Transfer the received maker token back to vault
        setAllowance(order.makerToken, PROXY, receivedMakerTokenAmount);
        Vault(VAULT).transferToVault(
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
                Vault(VAULT).transferToVault(
                    id,
                    order.takerToken,
                    address(this),
                    extraTakerTokenAmount
                );
            } else if (order.takerToken == order.takerFeeToken) {
                // If the fee token is the same as the taker token, transfer extras back together
                uint256 totalAmount = extraTakerTokenAmount.add(extraTakerFeeTokenAmount);

                setAllowance(order.takerToken, PROXY, extraTakerTokenAmount);
                Vault(VAULT).transferToVault(
                    id,
                    order.takerToken,
                    address(this),
                    totalAmount
                );
            } else {
                // If the fee token is different than the taker token,
                // transfer extras back separately

                setAllowance(order.takerToken, PROXY, extraTakerTokenAmount);
                Vault(VAULT).transferToVault(
                    id,
                    order.takerToken,
                    address(this),
                    extraTakerTokenAmount
                );

                if (extraTakerFeeTokenAmount > 0) {
                    setAllowance(order.takerFeeToken, PROXY, extraTakerFeeTokenAmount);
                    Vault(VAULT).transferToVault(
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
    )
        internal
        view
    {
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
