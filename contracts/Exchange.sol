pragma solidity 0.4.15;

/// Modified version of 0x Exchange contract. Uses dYdX proxy and no protocol token

/*

  Copyright 2017 ZeroEx Inc.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.

*/

import "./Proxy.sol";
import "./interfaces/ERC20.sol";
import "./lib/SafeMath.sol";

/// @title Exchange - Facilitates exchange of ERC20 tokens.
/// @author Amir Bandeali - <amir@0xProject.com>, Will Warren - <will@0xProject.com>
contract Exchange is SafeMath {

    // Error Codes
    uint8 constant ERROR_ORDER_EXPIRED = 0;                     // Order has already expired
    uint8 constant ERROR_ORDER_FULLY_FILLED_OR_CANCELLED = 1;   // Order has already been fully filled or cancelled
    uint8 constant ERROR_ROUNDING_ERROR_TOO_LARGE = 2;          // Rounding error too large
    uint8 constant ERROR_INSUFFICIENT_BALANCE_OR_ALLOWANCE = 3; // Insufficient balance or allowance for token transfer


    address public PROXY_CONTRACT;

    // Mappings of orderHash => amounts of takerTokenAmount filled or cancelled.
    mapping (bytes32 => uint) public filled;
    mapping (bytes32 => uint) public cancelled;

    event LogFill(
        address indexed maker,
        address taker,
        address indexed feeRecipient,
        address makerToken,
        address takerToken,
        uint filledMakerTokenAmount,
        uint filledTakerTokenAmount,
        uint paidMakerFee,
        uint paidTakerFee,
        bytes32 indexed tokens, // sha3(makerToken, takerToken), allows subscribing to a token pair
        bytes32 orderHash
    );

    event LogCancel(
        address indexed maker,
        address indexed feeRecipient,
        address makerToken,
        address takerToken,
        uint cancelledMakerTokenAmount,
        uint cancelledTakerTokenAmount,
        bytes32 indexed tokens,
        bytes32 orderHash
    );

    event LogError(uint8 indexed errorId, bytes32 indexed orderHash);

    struct Order {
        address maker;
        address taker;
        address makerToken;
        address takerToken;
        address feeRecipient;
        uint makerTokenAmount;
        uint takerTokenAmount;
        uint makerFee;
        uint takerFee;
        uint expirationTimestampInSec;
        bytes32 orderHash;
    }

    function Exchange(address _PROXY_CONTRACT) {
        PROXY_CONTRACT = _PROXY_CONTRACT;
    }

    /*
    * Core exchange functions
    */

    /// @dev Fills the input order.
    /// @param orderAddresses Array of order's maker, taker, makerToken, takerToken, and feeRecipient.
    /// @param orderValues Array of order's makerTokenAmount, takerTokenAmount, makerFee, takerFee, expirationTimestampInSec, and salt.
    /// @param fillTakerTokenAmount Desired amount of takerToken to fill.
    /// @param shouldThrowOnInsufficientBalanceOrAllowance Test if transfer will fail before attempting.
    /// @param v ECDSA signature parameter v.
    /// @param r CDSA signature parameters r.
    /// @param s CDSA signature parameters s.
    /// @return Total amount of takerToken filled in trade.
    function fillOrder(
        address[5] orderAddresses,
        uint[6] orderValues,
        uint fillTakerTokenAmount,
        bool shouldThrowOnInsufficientBalanceOrAllowance,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) returns (
        uint filledTakerTokenAmount
    ) {
        Order memory order = Order({
            maker: orderAddresses[0],
            taker: orderAddresses[1],
            makerToken: orderAddresses[2],
            takerToken: orderAddresses[3],
            feeRecipient: orderAddresses[4],
            makerTokenAmount: orderValues[0],
            takerTokenAmount: orderValues[1],
            makerFee: orderValues[2],
            takerFee: orderValues[3],
            expirationTimestampInSec: orderValues[4],
            orderHash: getOrderHash(orderAddresses, orderValues)
        });

        require(order.taker == address(0) || order.taker == msg.sender);

        require(isValidSignature(
            order.maker,
            order.orderHash,
            v,
            r,
            s
        ));

        if (block.timestamp >= order.expirationTimestampInSec) {
            LogError(ERROR_ORDER_EXPIRED, order.orderHash);
            return 0;
        }

        uint remainingTakerTokenAmount = safeSub(
            order.takerTokenAmount,
            getUnavailableTakerTokenAmount(order.orderHash)
        );
        filledTakerTokenAmount = min256(fillTakerTokenAmount, remainingTakerTokenAmount);
        if (filledTakerTokenAmount == 0) {
            LogError(ERROR_ORDER_FULLY_FILLED_OR_CANCELLED, order.orderHash);
            return 0;
        }

        if (
            isRoundingError(
                filledTakerTokenAmount,
                order.takerTokenAmount,
                order.makerTokenAmount
            )
        ) {
            LogError(ERROR_ROUNDING_ERROR_TOO_LARGE, order.orderHash);
            return 0;
        }

        uint filledMakerTokenAmount = getPartialAmount(
            filledTakerTokenAmount,
            order.takerTokenAmount,
            order.makerTokenAmount
        );

        // Maker fee is deducted from the taker token the maker receives
        uint fillMakerFee = getPartialAmount(
            fillTakerTokenAmount,
            order.takerTokenAmount,
            order.makerFee
        );
        // Taker fee is deducted from the maker token the taker receives
        uint fillTakerFee = getPartialAmount(
            fillTakerTokenAmount,
            order.takerTokenAmount,
            order.takerFee
        );

        if (
            !shouldThrowOnInsufficientBalanceOrAllowance
            && !isTransferable(
                order,
                filledMakerTokenAmount,
                filledTakerTokenAmount
            )
        ) {
            LogError(ERROR_INSUFFICIENT_BALANCE_OR_ALLOWANCE, order.orderHash);
            return 0;
        }

        filled[order.orderHash] = safeAdd(filled[order.orderHash], filledTakerTokenAmount);

        transferViaProxy(
            order.makerToken,
            order.maker,
            msg.sender,
            safeSub(filledMakerTokenAmount, fillTakerFee)
        );
        transferViaProxy(
            order.takerToken,
            msg.sender,
            order.maker,
            safeSub(filledTakerTokenAmount, fillMakerFee)
        );

        if (fillMakerFee > 0) {
            transferViaProxy(
                order.takerToken,
                msg.sender,
                order.feeRecipient,
                fillMakerFee
            );
        }
        if (fillTakerFee > 0) {
            transferViaProxy(
                order.makerToken,
                order.maker,
                order.feeRecipient,
                fillTakerFee
            );
        }

        LogFill(
            order.maker,
            msg.sender,
            order.feeRecipient,
            order.makerToken,
            order.takerToken,
            filledMakerTokenAmount,
            filledTakerTokenAmount,
            fillMakerFee,
            fillTakerFee,
            sha3(order.makerToken, order.takerToken),
            order.orderHash
        );
        return filledTakerTokenAmount;
    }

    /// @dev Cancels the input order.
    /// @param orderAddresses Array of order's maker, taker, makerToken, takerToken, and feeRecipient.
    /// @param orderValues Array of order's makerTokenAmount, takerTokenAmount, makerFee, takerFee, expirationTimestampInSec, and salt.
    /// @param canceltakerTokenAmount Desired amount of takerToken to cancel in order.
    /// @return Amount of takerToken cancelled.
    function cancelOrder(
        address[5] orderAddresses,
        uint[6] orderValues,
        uint canceltakerTokenAmount
    ) returns (
        uint cancelledTakerTokenAmount
    ) {
        Order memory order = Order({
            maker: orderAddresses[0],
            taker: orderAddresses[1],
            makerToken: orderAddresses[2],
            takerToken: orderAddresses[3],
            feeRecipient: orderAddresses[4],
            makerTokenAmount: orderValues[0],
            takerTokenAmount: orderValues[1],
            makerFee: orderValues[2],
            takerFee: orderValues[3],
            expirationTimestampInSec: orderValues[4],
            orderHash: getOrderHash(orderAddresses, orderValues)
        });

        require(order.maker == msg.sender);

        if (block.timestamp >= order.expirationTimestampInSec) {
            LogError(ERROR_ORDER_EXPIRED, order.orderHash);
            return 0;
        }

        uint remainingTakerTokenAmount = safeSub(
            order.takerTokenAmount,
            getUnavailableTakerTokenAmount(order.orderHash)
        );
        cancelledTakerTokenAmount = min256(canceltakerTokenAmount, remainingTakerTokenAmount);
        if (cancelledTakerTokenAmount == 0) {
            LogError(ERROR_ORDER_FULLY_FILLED_OR_CANCELLED, order.orderHash);
            return 0;
        }

        cancelled[order.orderHash] = safeAdd(cancelled[order.orderHash], cancelledTakerTokenAmount);

        LogCancel(
            order.maker,
            order.feeRecipient,
            order.makerToken,
            order.takerToken,
            getPartialAmount(
                cancelledTakerTokenAmount,
                order.takerTokenAmount,
                order.makerTokenAmount
            ),
            cancelledTakerTokenAmount,
            sha3(order.makerToken, order.takerToken),
            order.orderHash
        );
        return cancelledTakerTokenAmount;
    }

    /*
    * Wrapper functions
    */

    /// @dev Fills an order with specified parameters and ECDSA signature, throws if specified amount not filled entirely.
    /// @param orderAddresses Array of order's maker, taker, makerToken, takerToken, and feeRecipient.
    /// @param orderValues Array of order's makerTokenAmount, takerTokenAmount, makerFee, takerFee, expirationTimestampInSec, and salt.
    /// @param fillTakerTokenAmount Desired amount of takerToken to fill.
    /// @param v ECDSA signature parameter v.
    /// @param r CDSA signature parameters r.
    /// @param s CDSA signature parameters s.
    /// @return Success of entire fillTakerTokenAmount being filled.
    function fillOrKillOrder(
        address[5] orderAddresses,
        uint[6] orderValues,
        uint fillTakerTokenAmount,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) returns (
        bool success
    ) {
        assert(fillOrder(
            orderAddresses,
            orderValues,
            fillTakerTokenAmount,
            false,
            v,
            r,
            s
        ) == fillTakerTokenAmount);
        return true;
    }

    /// @dev Synchronously executes multiple fill orders in a single transaction.
    /// @param orderAddresses Array of address arrays containing individual order addresses.
    /// @param orderValues Array of uint arrays containing individual order values.
    /// @param fillTakerTokenAmounts Array of desired amounts of takerToken to fill in orders.
    /// @param shouldThrowOnInsufficientBalanceOrAllowance Test if transfers will fail before attempting.
    /// @param v Array ECDSA signature v parameters.
    /// @param r Array of ECDSA signature r parameters.
    /// @param s Array of ECDSA signature s parameters.
    /// @return Successful if no orders throw.
    function batchFillOrders(
        address[5][] orderAddresses,
        uint[6][] orderValues,
        uint[] fillTakerTokenAmounts,
        bool shouldThrowOnInsufficientBalanceOrAllowance,
        uint8[] v,
        bytes32[] r,
        bytes32[] s
    ) returns (
        bool success
    ) {
        for (uint i = 0; i < orderAddresses.length; i++) {
            fillOrder(
                orderAddresses[i],
                orderValues[i],
                fillTakerTokenAmounts[i],
                shouldThrowOnInsufficientBalanceOrAllowance,
                v[i],
                r[i],
                s[i]
            );
        }

        return true;
    }

    /// @dev Synchronously executes multiple fillOrKill orders in a single transaction.
    /// @param orderAddresses Array of address arrays containing individual order addresses.
    /// @param orderValues Array of uint arrays containing individual order values.
    /// @param fillTakerTokenAmounts Array of desired amounts of takerToken to fill in orders.
    /// @param v Array ECDSA signature v parameters.
    /// @param r Array of ECDSA signature r parameters.
    /// @param s Array of ECDSA signature s parameters.
    /// @return Success of all orders being filled with respective fillTakerTokenAmount.
    function batchFillOrKillOrders(
        address[5][] orderAddresses,
        uint[6][] orderValues,
        uint[] fillTakerTokenAmounts,
        uint8[] v,
        bytes32[] r,
        bytes32[] s
    ) returns (
        bool success
    ) {
        for (uint i = 0; i < orderAddresses.length; i++) {
            assert(fillOrKillOrder(
                orderAddresses[i],
                orderValues[i],
                fillTakerTokenAmounts[i],
                v[i],
                r[i],
                s[i]
            ));
        }
        return true;
    }

    /// @dev Synchronously executes multiple fill orders in a single transaction until total fillTakerTokenAmount filled.
    /// @param orderAddresses Array of address arrays containing individual order addresses.
    /// @param orderValues Array of uint arrays containing individual order values.
    /// @param fillTakerTokenAmount Desired total amount of takerToken to fill in orders.
    /// @param shouldThrowOnInsufficientBalanceOrAllowance Test if transfers will fail before attempting.
    /// @param v Array ECDSA signature v parameters.
    /// @param r Array of ECDSA signature r parameters.
    /// @param s Array of ECDSA signature s parameters.
    /// @return Total amount of fillTakerTokenAmount filled in orders.
    function fillOrdersUpTo(
        address[5][] orderAddresses,
        uint[6][] orderValues,
        uint fillTakerTokenAmount,
        bool shouldThrowOnInsufficientBalanceOrAllowance,
        uint8[] v,
        bytes32[] r,
        bytes32[] s
    ) returns (
        uint filledTakerTokenAmount
    ) {
        filledTakerTokenAmount = 0;
        for (uint i = 0; i < orderAddresses.length; i++) {
            require(orderAddresses[i][3] == orderAddresses[0][3]); // takerToken must be the same for each order
            filledTakerTokenAmount = safeAdd(filledTakerTokenAmount, fillOrder(
                orderAddresses[i],
                orderValues[i],
                safeSub(fillTakerTokenAmount, filledTakerTokenAmount),
                shouldThrowOnInsufficientBalanceOrAllowance,
                v[i],
                r[i],
                s[i]
            ));
            if (filledTakerTokenAmount == fillTakerTokenAmount) break;
        }
        return filledTakerTokenAmount;
    }

    /// @dev Synchronously cancels multiple orders in a single transaction.
    /// @param orderAddresses Array of address arrays containing individual order addresses.
    /// @param orderValues Array of uint arrays containing individual order values.
    /// @param cancelTakerTokenAmounts Array of desired amounts of takerToken to cancel in orders.
    /// @return Successful if no cancels throw.
    function batchCancelOrders(
        address[5][] orderAddresses,
        uint[6][] orderValues,
        uint[] cancelTakerTokenAmounts
    ) returns (
        bool success
    ) {
        for (uint i = 0; i < orderAddresses.length; i++) {
            cancelOrder(
                orderAddresses[i],
                orderValues[i],
                cancelTakerTokenAmounts[i]
            );
        }
        return true;
    }

    /*
    * Constant public functions
    */

    /// @dev Calculates Keccak-256 hash of order with specified parameters.
    /// @param orderAddresses Array of order's maker, taker, makerToken, takerToken, and feeRecipient.
    /// @param orderValues Array of order's makerTokenAmount, takerTokenAmount, makerFee, takerFee, expirationTimestampInSec, and salt.
    /// @return Keccak-256 hash of order.
    function getOrderHash(
        address[5] orderAddresses, uint[6] orderValues
    ) constant returns (
        bytes32 orderHash
    ) {
        return sha3(
            address(this),
            orderAddresses[0], // maker
            orderAddresses[1], // taker
            orderAddresses[2], // makerToken
            orderAddresses[3], // takerToken
            orderAddresses[4], // feeRecipient
            orderValues[0],    // makerTokenAmount
            orderValues[1],    // takerTokenAmount
            orderValues[2],    // makerFee
            orderValues[3],    // takerFee
            orderValues[4],    // expirationTimestampInSec
            orderValues[5]     // salt
        );
    }

    /// @dev Verifies that an order signature is valid.
    /// @param signer address of signer.
    /// @param hash Signed Keccak-256 hash.
    /// @param v ECDSA signature parameter v.
    /// @param r ECDSA signature parameters r.
    /// @param s ECDSA signature parameters s.
    /// @return Validity of order signature.
    function isValidSignature(
        address signer,
        bytes32 hash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) constant returns (
        bool isValid
    ) {
        return signer == ecrecover(
            sha3("\x19Ethereum Signed Message:\n32", hash),
            v,
            r,
            s
        );
    }

    /// @dev Checks if rounding error > 0.1%.
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to multiply with numerator/denominator.
    /// @return Rounding error is present.
    function isRoundingError(
        uint numerator,
        uint denominator,
        uint target
    ) constant returns (
        bool isError
    ) {
        return (target < 10**3 && mulmod(target, numerator, denominator) != 0);
    }

    /// @dev Calculates partial value given a numerator and denominator.
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to calculate partial of.
    /// @return Partial value of target.
    function getPartialAmount(
        uint numerator,
        uint denominator,
        uint target
    ) constant returns (
        uint partialValue
    ) {
        return safeDiv(safeMul(numerator, target), denominator);
    }

    /// @dev Calculates the sum of values already filled and cancelled for a given order.
    /// @param orderHash The Keccak-256 hash of the given order.
    /// @return Sum of values already filled and cancelled.
    function getUnavailableTakerTokenAmount(
        bytes32 orderHash
    ) constant returns (
        uint unavailableTakerTokenAmount
    ) {
        return safeAdd(filled[orderHash], cancelled[orderHash]);
    }


    /*
    * Internal functions
    */
    /// @dev Transfers a token using PROXY_CONTRACT transferFrom function.
    /// @param token Address of token to transferFrom.
    /// @param from Address transfering token.
    /// @param to Address receiving token.
    /// @param value Amount of token to transfer.
    /// @return Success of token transfer.
    function transferViaProxy(
        address token,
        address from,
        address to,
        uint value
    ) internal {
        Proxy(PROXY_CONTRACT).transferFrom(token, from, to, value);
    }

    /// @dev Checks if any order transfers will fail.
    /// @param order Order struct of params that will be checked.
    /// @param filledMakerTokenAmount Desired amount of makerToken to fill.
    /// @param filledTakerTokenAmount Desired amount of takerToken to fill.
    /// @return Predicted result of transfers.
    function isTransferable(
        Order order,
        uint filledMakerTokenAmount,
        uint filledTakerTokenAmount
    ) internal constant returns (
        bool _isTransferable
    ) {
        address taker = msg.sender;

        return getBalance(order.makerToken, order.maker) >= filledMakerTokenAmount
               && getAllowance(order.makerToken, order.maker) >= filledMakerTokenAmount
               && getBalance(order.takerToken, taker) >= filledTakerTokenAmount
               && getAllowance(order.takerToken, taker) >= filledTakerTokenAmount;
    }

    /// @dev Get token balance of an address.
    /// @param token Address of token.
    /// @param owner Address of owner.
    /// @return Token balance of owner.
    function getBalance(
        address token,
        address owner
    ) internal constant returns (
        uint balance
    ) {
        return ERC20(token).balanceOf(owner);
    }

    /// @dev Get allowance of token given to PROXY_CONTRACT by an address.
    /// @param token Address of token.
    /// @param owner Address of owner.
    /// @return Allowance of token given to PROXY_CONTRACT by owner.
    function getAllowance(
        address token,
        address owner
    ) internal constant returns (
        uint allowance
    ) {
        return ERC20(token).allowance(owner, PROXY_CONTRACT);
    }
}
