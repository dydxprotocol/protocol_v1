pragma solidity ^0.4.13;

import './lib/Ownable.sol';
import './CoveredOption.sol';
import './Proxy.sol';

contract Creator is Ownable {
  // -----------------------
  // ------ Constants ------
  // -----------------------

  bytes8 constant COVERED_OPTION_TYPE = "0xCOVER_OP";

  // ---------------------------
  // ----- State Variables -----
  // ---------------------------

  // Address of the dYdX Proxy Contract
  address public proxy;

  // Address of the 0x Exchange Contract
  address public exchange;

  // Address of the 0x Exchange Proxy Contract
  address public exchangeProxy;

  // Mapping storing all child derivatives in existence
  mapping(bytes32 => address) childDerivatives;

  // -------------------------
  // ------ Constructor ------
  // -------------------------

  function Creator(
    address _owner,
    address _proxy,
    address _exchange,
    address _exchangeProxy
  ) Ownable(_owner) {
    proxy = _proxy;
    exchange = _exchange;
    exchangeProxy = _exchangeProxy;
  }

  // -----------------------------------------
  // ---- Public State Changing Functions ----
  // -----------------------------------------

  function createCoveredOption(
    address underlyingToken,
    address baseToken,
    uint256 expirationTimestamp,
    uint256 underlyingTokenStrikeRate,
    uint256 baseTokenStrikeRate
  ) public returns(address _option) {
    bytes32 optionHash = sha3(
      COVERED_OPTION_TYPE,
      underlyingToken,
      baseToken,
      expirationTimestamp,
      underlyingTokenStrikeRate,
      baseTokenStrikeRate
    );

    require(childDerivatives[optionHash] == address(0));

    address option = new CoveredOption(
      underlyingToken,
      baseToken,
      expirationTimestamp,
      underlyingTokenStrikeRate,
      baseTokenStrikeRate,
      exchange,
      exchangeProxy,
      proxy
    );

    childDerivatives[optionHash] = option;

    Proxy(proxy).authorize(option);

    return option;
  }

  // -------------------------------------
  // ----- Public Constant Functions -----
  // -------------------------------------

  function getCoveredOption(
    address underlyingToken,
    address baseToken,
    uint256 expirationTimestamp,
    uint256 underlyingTokenStrikeRate,
    uint256 baseTokenStrikeRate
  ) constant public returns(address _option){
    bytes32 optionHash = sha3(
      COVERED_OPTION_TYPE,
      underlyingToken,
      baseToken,
      expirationTimestamp,
      underlyingTokenStrikeRate,
      baseTokenStrikeRate
    );

    return childDerivatives[optionHash];
  }

  /**
   * Divide integer values
   *
   * @param  {uint} numerator
   * @param  {uint} denominator
   * @param  {uint} target
   * @return {uint} value of the division
   */
  function getPartialAmount(
    uint numerator,
    uint denominator,
    uint target
  ) constant public returns (uint partialValue) {
    return Exchange(exchange).getPartialAmount(numerator, denominator, target);
  }

  // --------------------------------
  // ----- Owner Only Functions -----
  // --------------------------------

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
