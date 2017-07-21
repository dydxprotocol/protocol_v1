pragma solidity ^0.4.13;

import './external/Exchange.sol';
import './interfaces/ERC20.sol';
import './Proxy.sol';

contract CoveredCall {
  /**
   * Constant Variables
   */

  address public optionToken;
  uint256 public expirationTimestamp; // TODO make sure in millis
  uint256 public strikePrice;
  address public strikeToken;

  /**
   * Variables
   */

  address public exchange; // TODO how to change
  address public proxy;
  mapping(address => uint256) public holders;
  mapping(address => uint256) public funders;
  uint256 public totalOptionToken;
  uint256 public totalExercised;
  uint256 public totalStrikeToken;

  /**
   * Constants
   */

  uint constant public COLLECTION_TIME = 14400000; // 4 Hours. ?? Make this variable?

  /**
   * Events
   */

  event Buy(address indexed writer, address indexed buyer, uint options, uint premium);
  event Exercise(address indexed exerciser, uint amount);
  event Withdrawal(address indexed withdrawer, uint amount);
  event Recovery(address indexed recoverer, uint amount);

  /**
   * Constructor
   */

  function CoveredCall(
    address _optionToken,
    uint256 _expirationTimestamp,
    uint256 _strikePrice,
    address _strikeToken,
    address _exchange,
    address _exchangeProxy,
    address _proxy
  ) {
    optionToken = _optionToken;
    expirationTimestamp = _expirationTimestamp;
    strikePrice = _strikePrice;
    strikeToken = _strikeToken;
    exchange = _exchange;
    proxy = _proxy;

    // TODO find max int value
    require(ERC20(_strikeToken).approve(_exchangeProxy, 100000000000000000000000000));
  }

  /**
   * Public Functions
   */

  function buy(
    address[2] orderAddresses, // writer, feeRecipient
    uint[6] orderValues,
    uint takerAmount,
    uint8 v,
    bytes32 r,
    bytes32 s
  ) returns(uint) {
    require(takerAmount > 0);
    require(block.timestamp < expirationTimestamp);
    require(orderValues[2] == 0 && orderValues[3] == 0); // Do fees ourselves

    // TODO Fees

    Proxy(proxy).transfer(strikeToken, msg.sender, takerAmount);

    address writer = orderAddresses[0];

    // Amount of strikeToken filled
    uint strikeTokenFilled = Exchange(exchange).fillOrder(
      [
        writer,
        address(this),
        optionToken,
        strikeToken,
        orderAddresses[1]
      ],
      orderValues,
      takerAmount,
      true,
      v,
      r,
      s
    );

    // TODO how to get amount of optionToken filled ??
    uint optionTokenFilled = 10;

    require(strikeTokenFilled > 0);
    require(optionTokenFilled > 0);

    holders[writer] = holders[writer] + optionTokenFilled;
    funders[msg.sender] = funders[msg.sender] + optionTokenFilled;

    // TODO make sure state of token has updated from first call
    if (strikeTokenFilled < takerAmount) {
      ERC20(strikeToken).transfer(msg.sender, takerAmount - strikeTokenFilled);
    }

    totalOptionToken = totalOptionToken + optionTokenFilled;

    Buy(writer, msg.sender, optionTokenFilled, strikeTokenFilled);

    return optionTokenFilled;
  }

  function exercise(uint amount) {
    require(amount > 0);

    uint256 balance = holders[msg.sender];
    require(balance >= amount);
    require(block.timestamp > expirationTimestamp);
    require(block.timestamp < expirationTimestamp + COLLECTION_TIME);

    uint strikeTotal = amount * strikePrice;
    Proxy(proxy).transfer(strikeToken, msg.sender, strikeTotal);

    holders[msg.sender] = balance - amount;

    require(ERC20(optionToken).transfer(msg.sender, amount));

    totalExercised = totalExercised + amount;

    Exercise(msg.sender, amount);
  }

  function withdraw(uint amount) returns(uint) {
    require(amount > 0);

    uint256 balance = funders[msg.sender];
    require(balance >= amount);
    require(
      block.timestamp > expirationTimestamp + COLLECTION_TIME
    );

    funders[msg.sender] = balance - amount;

    // TODO understand rounding errors
    uint withdrawalAmount = ((totalOptionToken - totalExercised) / totalOptionToken) * amount;

    require(ERC20(optionToken).transfer(msg.sender, withdrawalAmount));

    Withdrawal(msg.sender, amount);

    return withdrawalAmount;
  }

  function recover(uint amount) {
    require(amount > 0);
    require(block.timestamp < expirationTimestamp);

    uint256 funderBalance = funders[msg.sender];
    uint256 holderBalance = holders[msg.sender];

    require(funderBalance >= amount);
    require(holderBalance >= amount);

    funders[msg.sender] = funderBalance - amount;
    holders[msg.sender] = holderBalance - amount;

    require(ERC20(optionToken).transfer(msg.sender, amount));

    Recovery(msg.sender, amount);

    totalOptionToken = totalOptionToken - amount;
  }

  /**
   * ERC20
   */

  mapping (address => mapping (address => uint256)) allowed;

  function totalSupply() constant returns (uint supply) {
    return totalOptionToken;
  }

  function balanceOf(address who) constant returns (uint value) {
    return holders[who];
  }

  function allowance(address owner, address spender) constant returns (uint _allowance) {
    return allowed[owner][spender];
  }

  function transfer( address to, uint value) returns (bool ok) {
    if (holders[msg.sender] >= value) {
      holders[msg.sender] -= value;
      holders[to] += value;
      Transfer(msg.sender, to, value);
      return true;
    } else {
      return false;
    }
  }

  function transferFrom( address from, address to, uint value) returns (bool ok) {
    if (holders[from] >= value && allowed[from][msg.sender] >= value) {
      holders[to] += value;
      holders[from] -= value;
      allowed[from][msg.sender] -= value;
      Transfer(from, to, value);
      return true;
    } else {
      return false;
    }
  }

  function approve( address spender, uint value ) returns (bool ok) {
    allowed[msg.sender][spender] = value;
    Approval(msg.sender, spender, value);
    return true;
  }

   event Transfer( address indexed from, address indexed to, uint value);
   event Approval( address indexed owner, address indexed spender, uint value);
}
