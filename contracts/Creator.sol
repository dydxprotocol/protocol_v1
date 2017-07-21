pragma solidity ^0.4.13;

import './lib/Ownable.sol';
import './CoveredCall.sol';
import './Proxy.sol';

contract Creator is Ownable {
  address proxy;
  address exchange;
  address exchangeProxy;

  mapping(bytes32 => address) options;

  function Creator(
    address _proxy,
    address _owner,
    address _exchange,
    address _exchangeProxy
  ) Ownable(_owner) {
    proxy = _proxy;
    exchange = _exchange;
    exchangeProxy = _exchangeProxy;
  }

  /**
   * Public functions
   */

  function createCoveredCall(
    address optionTokenAddress,
    address strikeTokenAddress,
    uint256 strikePrice,
    uint256 expirationTimestamp
  ) returns(address) {
    bytes32 optionHash = sha3(
      optionTokenAddress,
      strikeTokenAddress,
      strikePrice,
      expirationTimestamp
    );

    require(options[optionHash] == address(0));
    address option = new CoveredCall(
      optionTokenAddress,
      expirationTimestamp,
      strikePrice,
      strikeTokenAddress,
      exchange,
      exchangeProxy,
      proxy
    );

    Proxy(proxy).authorize(option);

    return option;
  }

  /**
   * Owner only functions
   */

  function updateExchange(address _exchange) onlyOwner {
    exchange = _exchange;
  }

  function updateExchangeProxy(address _exchangeProxy) onlyOwner {
    exchangeProxy = _exchangeProxy;
  }

  function updateProxy(address _proxy) onlyOwner {
    proxy = _proxy;
  }
}
