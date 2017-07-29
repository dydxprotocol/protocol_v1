pragma solidity ^0.4.13;

import './lib/AccessControlled.sol';
import './interfaces/ERC20.sol';
import './Proxy.sol';
import './external/Exchange.sol';

contract Vault is AccessControlled {
    uint constant ACCESS_DELAY = 1000 * 60 * 60 * 24; // 1 Day
    uint constant GRACE_PERIOD = 1000 * 60 * 60 * 8; // 8 hours
    address public ZRX_TOKEN_CONTRACT;

    mapping(bytes32 => mapping(address => uint256)) public balances;
    mapping(address => uint256) public totalBalances;

    mapping(address => bool) private authorizedTokens;

    address proxy;

    // Address of the 0x Exchange Contract
    address exchange;

    // Address of the 0x Proxy Contract
    address exchangeProxy;

    function Vault(
    address _owner,
    address _proxy,
    address _exchange,
    address _ZRX_TOKEN_CONTRACT
    ) AccessControlled(_owner, ACCESS_DELAY, GRACE_PERIOD) {
        proxy = _proxy;
        exchange = _exchange;
        ZRX_TOKEN_CONTRACT = _ZRX_TOKEN_CONTRACT;
    }

    function updateProxy(address _proxy) onlyOwner {
        proxy = _proxy;
    }

    function updateExchange(address _exchange) onlyOwner {
        exchange = _exchange;
    }

    function transfer(
        bytes32 id,
        address token,
        address from,
        uint amount
    ) requiresAuthorization {
        Proxy(proxy).transfer(token, from, amount);

        require(ERC20(token).balanceOf(address(this)) == totalBalances[token] + amount);

        balances[id][token] = balances[id][token] + amount;
        totalBalances[token] = totalBalances[token] + amount;
    }

    function send(
    bytes32 id,
    address token,
    address to,
    uint amount
    ) requiresAuthorization {
        uint256 balance = balances[id][token];
        require(balance >= amount);

        balances[id][token] = balances[id][token] - amount;
        require(ERC20(token).transfer(to, amount));

        require(ERC20(token).balanceOf(address(this)) == totalBalances[token] - amount);
        totalBalances[token] = totalBalances[token] - amount;
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
    ) requiresAuthorization returns(
        uint _filledTakerTokenAmount,
        uint _makerTokenAmount
    ) {
        require(balances[id][orderAddresses[3]] >= requestedFillAmount);
        require(totalBalances[orderAddresses[3]] >= requestedFillAmount);

        balances[id][orderAddresses[3]] = balances[id][orderAddresses[3]] - requestedFillAmount;

        if (!authorizedTokens[orderAddresses[3]]) {
            ERC20(orderAddresses[3]).approve(address(exchangeProxy), 2 ** 255);
            authorizedTokens[orderAddresses[3]] = true;
        }

        uint filledTakerTokenAmount = Exchange(exchange).fillOrder(
            orderAddresses,
            orderValues,
            requestedFillAmount,
            true,
            v,
            r,
            s
        );

        if (requireFullAmount) {
            require(requestedFillAmount == filledTakerTokenAmount);
        }

        uint makerTokenAmount = Exchange(exchange).getPartialAmount(
            orderValues[0],
            orderValues[1],
            filledTakerTokenAmount
        );
        uint feeAmount = Exchange(exchange).getPartialAmount(
            filledTakerTokenAmount,
            orderValues[1],
            orderValues[3]
        );

        updateBalancesForTrade(
            id,
            orderAddresses[2],
            orderAddresses[3],
            makerTokenAmount,
            filledTakerTokenAmount,
            requestedFillAmount,
            feeAmount
        );

        return (filledTakerTokenAmount, makerTokenAmount);
    }

    function updateBalancesForTrade(
        bytes32 id,
        address makerToken,
        address takerToken,
        uint makerAmount,
        uint takerAmount,
        uint requestedFillAmount,
        uint feeAmount
    ) internal {
        require(balances[id][ZRX_TOKEN_CONTRACT] >= feeAmount);
        require(
            ERC20(ZRX_TOKEN_CONTRACT).balanceOf(address(this))
            == totalBalances[ZRX_TOKEN_CONTRACT] - feeAmount
        );
        require(
            ERC20(makerToken).balanceOf(address(this))
            == totalBalances[makerToken] + makerAmount
        );
        require(
            ERC20(takerToken).balanceOf(address(this))
            == totalBalances[takerToken] - takerAmount
        );

        balances[id][takerToken] = balances[id][takerToken] + requestedFillAmount - takerAmount;
        balances[id][makerToken] = balances[id][makerToken] + makerAmount;
        balances[id][ZRX_TOKEN_CONTRACT] = balances[id][ZRX_TOKEN_CONTRACT] + feeAmount;

        totalBalances[takerToken] = totalBalances[takerToken] - takerAmount;
        totalBalances[makerToken] = totalBalances[makerToken] + makerAmount;
        totalBalances[ZRX_TOKEN_CONTRACT] = totalBalances[ZRX_TOKEN_CONTRACT] - feeAmount;
    }
}
