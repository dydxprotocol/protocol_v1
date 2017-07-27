pragma solidity ^0.4.13;

import './lib/AccessControlled.sol';
import './interfaces/ERC20.sol';
import './Proxy.sol';
import './external/Exchange.sol';

contract Vault is AccessControlled {
  uint constant ACCESS_DELAY = 1000 * 60 * 60 * 24; // 1 Day
  uint constant GRACE_PERIOD = 1000 * 60 * 60 * 8; // 8 hours

  mapping(bytes32 => mapping(address => uint256)) public balances;
  mapping(address => uint256) public totalBalances;

  address proxy;
  address exchange;

  function Vault(
    address _owner,
    address _proxy,
    address _exchange
  ) AccessControlled(_owner, ACCESS_DELAY, GRACE_PERIOD) {
    proxy = _proxy;
    exchange = _exchange;
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
    uint fillTakerTokenAmount,
    uint8 v,
    bytes32 r,
    bytes32 s,
    bool requireFullAmount
  ) requiresAuthorization returns(
    uint _filledTakerTokenAmount,
    uint _makerTokenAmount
  ) {
    require(balances[id][orderAddresses[3]] >= fillTakerTokenAmount);
    require(totalBalances[orderAddresses[3]] >= fillTakerTokenAmount);

    balances[id][orderAddresses[3]] = balances[id][orderAddresses[3]] - fillTakerTokenAmount;

    uint filledTakerTokenAmount = Exchange(exchange).fillOrder(
      orderAddresses,
      orderValues,
      fillTakerTokenAmount,
      true,
      v,
      r,
      s
    );

    if (requireFullAmount) {
      require(fillTakerTokenAmount == filledTakerTokenAmount);
    }

    uint makerTokenAmount = Exchange(exchange).getPartialAmount(
      orderValues[0],
      orderValues[1],
      filledTakerTokenAmount
    );

    require(
      ERC20(orderAddresses[2]).balanceOf(address(this))
      == totalBalances[orderAddresses[2]] + makerTokenAmount
    );
    require(
      ERC20(orderAddresses[3]).balanceOf(address(this))
      == totalBalances[orderAddresses[3]] + filledTakerTokenAmount
    );

    balances[id][orderAddresses[3]] =
      balances[id][orderAddresses[3]] + fillTakerTokenAmount - filledTakerTokenAmount;
    balances[id][orderAddresses[2]] = balances[id][orderAddresses[2]] + makerTokenAmount;

    totalBalances[orderAddresses[3]] = totalBalances[orderAddresses[3]] - filledTakerTokenAmount;
    totalBalances[orderAddresses[2]] = totalBalances[orderAddresses[2]] + makerTokenAmount;

    return (filledTakerTokenAmount, makerTokenAmount);
  }
}
