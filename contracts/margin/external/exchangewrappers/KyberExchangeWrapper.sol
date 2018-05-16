pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { MathHelpers } from "../../../lib/MathHelpers.sol";
import { TokenInteract } from "../../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../../interfaces/ExchangeWrapper.sol";
import { OnlyMargin } from "../../interfaces/OnlyMargin.sol";


/**
 * @title KyberExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with Kyber Network
 */
/* solium-disable-next-line */
contract KyberExchangeWrapper is
    HasNoContracts,
    OnlyMargin,
    ExchangeWrapper
{
    using SafeMath for uint256;

    struct Order {
        address walletId;
        uint256 srcAmount;
        uint256 maxDestAmount;
        uint256 minConversionRate;
    }

    struct StartingBalances {
        uint256 srcTokenBalance;
        uint256 destTokenBalance;
    }

    address public ETH_TOKEN_ADDRESS = 0x00eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee;
    address public DYDX_PROXY;
    address public KYBER_NETWORK;
    address public WRAPPED_ETH;

    constructor(
        address margin,
        address dydxProxy,
        address kyberNetwork,
        address wrappedEth
    )
        public
        OnlyMargin(margin)
    {
        DYDX_PROXY = dydxProxy;
        KYBER_NETWORK = kyberNetwork;
        WRAPPED_ETH = wrappedEth;
    }

    // ============ Margin-Only Functions ============

    function exchange(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        onlyMargin
        returns (uint256)
    {
        bool usesWrappedEth = (takerToken == ETH_TOKEN_ADDRESS);
        Order memory order = parseOrder(orderData);

        address destAddress = address(this);

        uint256 receivedMakerTokenAmount = KyberNetwork(KYBER_NETWORK).trade(
            takerToken,
            order.srcAmount,
            makerToken,
            destAddress,
            order.maxDestAmount,
            order.minConversionRate,
            order.walletId
        );

        TokenInteract.approve(
            makerToken,
            DYDX_PROXY,
            receivedMakerTokenAmount
        );

        return receivedMakerTokenAmount;
    }

    function exchangeForAmount(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        onlyMargin
        returns (uint256)
    {
        Order memory order = parseOrder(orderData);

        uint256 requiredTakerTokenAmount = MathHelpers.getPartialAmountRoundedUp(
            order.takerTokenAmount,
            order.makerTokenAmount,
            desiredMakerToken
        );

        uint256 receivedMakerTokenAmount = exchangeImpl(
            order,
            makerToken,
            takerToken,
            tradeOriginator,
            requiredTakerTokenAmount
        );

        assert(receivedMakerTokenAmount >= desiredMakerToken);

        /**
         * Version 1 implementation is to leave any excess received maker token locked in this
         * this contract (forever). With normal token amounts (on the order of 10^18), it will
         * not be worth the extra gas cost to send this extra token back to anyone.
         */

        TokenInteract.approve(
            makerToken,
            DYDX_PROXY,
            desiredMakerToken
        );

        return requiredTakerTokenAmount;
    }

    // ============ Public Constant Functions ============

    function getTradeMakerTokenAmount(
        address /* makerToken */,
        address /* takerToken */,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        view
        returns (uint256)
    {
        Order memory order = parseOrder(orderData);

        return MathHelpers.getPartialAmount(
            requestedFillAmount,
            order.takerTokenAmount,
            order.makerTokenAmount
        );
    }

    function getTakerTokenPrice(
        address /* makerToken */,
        address /* takerToken */,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        view
        returns (uint256)
    {
        Order memory order = parseOrder(orderData);

        return MathHelpers.getPartialAmountRoundedUp(
            order.takerTokenAmount,
            order.makerTokenAmount,
            desiredMakerToken
        );
    }

    // ============ Internal Functions ============

    function exchangeImpl(
        Order order,
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 requestedFillAmount
    )
        internal
        returns (uint256)
    {
        assert(TokenInteract.balanceOf(takerToken, address(this)) >= requestedFillAmount);
        assert(requestedFillAmount > 0);
        require(requestedFillAmount <= order.takerTokenAmount);

        transferTakerFee(
            order,
            tradeOriginator,
            requestedFillAmount
        );

        TokenInteract.approve(
            takerToken,
            ZERO_EX_PROXY,
            requestedFillAmount
        );

        uint256 filledTakerTokenAmount = doTrade(
            order,
            makerToken,
            takerToken,
            requestedFillAmount
        );

        require(filledTakerTokenAmount == requestedFillAmount);

        uint256 receivedMakerTokenAmount = MathHelpers.getPartialAmount(
            order.makerTokenAmount,
            order.takerTokenAmount,
            filledTakerTokenAmount
        );

        return receivedMakerTokenAmount;
    }

    function transferTakerFee(
        Order order,
        address tradeOriginator,
        uint256 requestedFillAmount
    )
        internal
    {
        if (order.feeRecipient == address(0)) {
            return;
        }

        uint256 takerFee = MathHelpers.getPartialAmount(
            requestedFillAmount,
            order.takerTokenAmount,
            order.takerFee
        );

        TokenInteract.transferFrom(
            ZRX,
            tradeOriginator,
            address(this),
            takerFee
        );
    }

    function doTrade(
        Order order,
        address makerToken,
        address takerToken,
        uint256 requestedFillAmount
    )
        internal
        returns (uint256)
    {
        uint256 filledTakerTokenAmount = ZeroExExchangeInterface(ZERO_EX_EXCHANGE).fillOrder(
            [
                order.maker,
                order.taker,
                makerToken,
                takerToken,
                order.feeRecipient
            ],
            [
                order.makerTokenAmount,
                order.takerTokenAmount,
                order.makerFee,
                order.takerFee,
                order.expirationUnixTimestampSec,
                order.salt
            ],
            requestedFillAmount,
            true,
            order.v,
            order.r,
            order.s
        );

        require(filledTakerTokenAmount == requestedFillAmount);

        return filledTakerTokenAmount;
    }

    // ============ Parsing Functions ============

    /**
     * Accepts a byte array with each variable padded to 32 bytes
     */
    function parseOrder(
        bytes orderData
    )
        internal
        pure
        returns (Order memory)
    {
        Order memory order;

        /**
         * Total: 384 bytes
         * mstore stores 32 bytes at a time, so go in increments of 32 bytes
         *
         * NOTE: The first 32 bytes in an array store the length, so we start reading from 32
         */
        /* solium-disable-next-line */
        assembly {
            mstore(order,           mload(add(orderData, 32)))  // address walletId
            mstore(add(order, 128), mload(add(orderData, 64)))  // uint256 srcAmount
            mstore(add(order, 160), mload(add(orderData, 96)))  // uint256 maxDestAmount
            mstore(add(order, 192), mload(add(orderData, 128))) // uint256 minConversionRate
        }

        return order;
    }
}
