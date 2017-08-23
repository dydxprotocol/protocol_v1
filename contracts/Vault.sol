pragma solidity 0.4.15;

import './lib/AccessControlled.sol';
import './lib/SafeMath.sol';
import './interfaces/ERC20.sol';
import './Proxy.sol';
import './Exchange.sol';

contract Vault is AccessControlled, SafeMath {
    uint public constant ACCESS_DELAY = 1 days;
    uint public constant GRACE_PERIOD = 8 hours;

    address public PROXY;
    address public EXCHANGE;

    mapping(bytes32 => mapping(address => uint256)) public balances;
    mapping(address => uint256) public totalBalances;

    function Vault(
        address _proxy,
        address _exchange
    ) AccessControlled(ACCESS_DELAY, GRACE_PERIOD) {
        PROXY = _proxy;
        EXCHANGE = _exchange;
    }

    // TODO perhaps add a delay to these changes
    function updateProxy(address _proxy) onlyOwner {
        PROXY = _proxy;
    }

    function updateExchange(address _exchange) onlyOwner {
        EXCHANGE = _exchange;
    }

    function transfer(
        bytes32 id,
        address token,
        address from,
        uint amount
    ) requiresAuthorization {
        Proxy(PROXY).transfer(token, from, amount);

        assert(ERC20(token).balanceOf(address(this)) == totalBalances[token] + amount);

        balances[id][token] = safeAdd(balances[id][token], amount);
        totalBalances[token] = safeAdd(totalBalances[token], amount);
    }

    function send(
        bytes32 id,
        address token,
        address to,
        uint amount
    ) requiresAuthorization {
        uint256 balance = balances[id][token];
        assert(balance >= amount);

        balances[id][token] = safeSub(balances[id][token], amount);
        assert(ERC20(token).transfer(to, amount));

        assert(ERC20(token).balanceOf(address(this)) == safeSub(totalBalances[token], amount));
        totalBalances[token] = safeSub(totalBalances[token], amount);
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

    function getPartialAmount(
        uint numerator,
        uint denominator,
        uint target
    ) constant public returns (
        uint partialValue
    ) {
        return safeDiv(safeMul(numerator, target), denominator);
    }

    function deleteBalances(
        bytes32 shortId,
        address baseToken,
        address underlyingToken
    ) requiresAuthorization {
        require(balances[shortId][baseToken] == 0);
        require(balances[shortId][underlyingToken] == 0);

        // ??? is it worth deleting these if they are 0 ?
        delete balances[shortId][baseToken];
        delete balances[shortId][underlyingToken];
    }

    function validateAndApproveTrade(
        bytes32 id,
        address[5] orderAddresses,
        uint requestedFillAmount
    ) internal {
        // Do not allow maker token and taker token to be the same
        require(orderAddresses[2] != orderAddresses[3]);
        require(balances[id][orderAddresses[3]] >= requestedFillAmount);
        assert(totalBalances[orderAddresses[3]] >= requestedFillAmount);

        balances[id][orderAddresses[3]] = safeSub(
            balances[id][orderAddresses[3]],
            requestedFillAmount
        );

        // Approve transfer of taker token by proxy for trade
        ERC20(orderAddresses[3]).approve(PROXY, requestedFillAmount);
    }

    function updateBalancesForTrade(
        bytes32 id,
        address makerToken,
        address takerToken,
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
        uint takerFee = getPartialAmount(filledTakerTokenAmount, orderValues[1], orderValues[3]);

        uint receivedMakerTokenAmount = safeSub(
            makerTokenAmount,
            takerFee
        );

        assert(
            ERC20(makerToken).balanceOf(address(this))
            == safeAdd(totalBalances[makerToken], receivedMakerTokenAmount)
        );
        assert(
            ERC20(takerToken).balanceOf(address(this))
            == safeSub(totalBalances[takerToken], filledTakerTokenAmount)
        );

        // Update balances for id
        balances[id][takerToken] = safeAdd(
            balances[id][takerToken],
            safeSub(requestedFillAmount, filledTakerTokenAmount)
        );
        balances[id][makerToken] = safeAdd(
            balances[id][makerToken],
            receivedMakerTokenAmount
        );

        // Update Total Balances
        totalBalances[takerToken] = safeSub(
            totalBalances[takerToken],
            filledTakerTokenAmount
        );
        totalBalances[makerToken] = safeAdd(
            totalBalances[makerToken],
            receivedMakerTokenAmount
        );

        return (filledTakerTokenAmount, receivedMakerTokenAmount);
    }
}
