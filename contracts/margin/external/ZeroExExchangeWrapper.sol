pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { HasNoContracts } from "zeppelin-solidity/contracts/ownership/HasNoContracts.sol";
import { HasNoEther } from "zeppelin-solidity/contracts/ownership/HasNoEther.sol";
import { ZeroExExchangeInterface } from "../../interfaces/ZeroExExchangeInterface.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";
import { TokenInteract } from "../../lib/TokenInteract.sol";
import { ExchangeWrapper } from "../interfaces/ExchangeWrapper.sol";


/**
 * @title ZeroExExchangeWrapper
 * @author dYdX
 *
 * dYdX ExchangeWrapper to interface with 0x Version 1
 */
/* solium-disable-next-line */
contract ZeroExExchangeWrapper is
    HasNoEther,
    HasNoContracts,
    ExchangeWrapper {
    using SafeMath for uint256;

    struct Order {
        address maker;
        address taker;
        address feeRecipient;
        uint256 makerTokenAmount;
        uint256 takerTokenAmount;
        uint256 makerFee;
        uint256 takerFee;
        uint256 expirationUnixTimestampSec;
        uint256 salt;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct StartingBalances {
        uint256 takerTokenBalance;
        uint256 makerTokenBalance;
        uint256 takerFeeTokenBalance;
    }

    address public MARGIN;
    address public DYDX_PROXY;
    address public ZERO_EX_EXCHANGE;
    address public ZERO_EX_PROXY;
    address public ZRX;

    function ZeroExExchangeWrapper(
        address margin,
        address dydxProxy,
        address zeroExExchange,
        address zeroExProxy,
        address zrxToken
    )
        public
    {
        MARGIN = margin;
        DYDX_PROXY = dydxProxy;
        ZERO_EX_EXCHANGE = zeroExExchange;
        ZERO_EX_PROXY = zeroExProxy;
        ZRX = zrxToken;

        // The ZRX token does not decrement allowance if set to MAX_UINT
        // therefore setting it once to the maximum amount is sufficient
        // NOTE: this is *not* standard behavior for an ERC20, so do not rely on it for other tokens
        TokenInteract.approve(ZRX, ZERO_EX_PROXY, MathHelpers.maxUint256());
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
        returns (uint256)
    {
        return exchangeImpl(
            makerToken,
            takerToken,
            tradeOriginator,
            requestedFillAmount,
            orderData
        );
    }

    function exchangeForAmount(
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 desiredMakerToken,
        bytes orderData
    )
        external
        returns (uint256)
    {
        uint256 requiredTakerTokenAmount = MathHelpers.getPartialAmountRoundedUp(
            order.takerTokenAmount,
            order.makerTokenAmount,
            desiredMakerToken
        );
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
        address makerToken,
        address takerToken,
        address tradeOriginator,
        uint256 requestedFillAmount,
        bytes orderData
    )
        external
        returns (uint256)
    {
        require(msg.sender == MARGIN);

        Order memory order = parseOrder(orderData);

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

        TokenInteract.approve(
            makerToken,
            DYDX_PROXY,
            receivedMakerTokenAmount
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

        if (takerFee > 0) {
            TokenInteract.transferFrom(
                ZRX,
                tradeOriginator,
                address(this),
                takerFee
            );
        }
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
            mstore(order,           mload(add(orderData, 32)))  // maker
            mstore(add(order, 32),  mload(add(orderData, 64)))  // taker
            mstore(add(order, 64),  mload(add(orderData, 96)))  // feeRecipient
            mstore(add(order, 96),  mload(add(orderData, 128))) // makerTokenAmount
            mstore(add(order, 128), mload(add(orderData, 160))) // takerTokenAmount
            mstore(add(order, 160), mload(add(orderData, 192))) // makerFee
            mstore(add(order, 192), mload(add(orderData, 224))) // takerFee
            mstore(add(order, 224), mload(add(orderData, 256))) // expirationUnixTimestampSec
            mstore(add(order, 256), mload(add(orderData, 288))) // salt
            mstore(add(order, 288), mload(add(orderData, 320))) // v
            mstore(add(order, 320), mload(add(orderData, 352))) // r
            mstore(add(order, 352), mload(add(orderData, 384))) // s
        }

        return order;
    }
}
