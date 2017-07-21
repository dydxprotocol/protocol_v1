pragma solidity ^0.4.13;

import './lib/Ownable.sol';
import './interfaces/ERC20.sol';

contract Proxy is Ownable {
  address creator;

  mapping(address => address) public authorizations;

  modifier onlyCreator() {
    require(msg.sender == creator);
    _;
  }

  function Proxy(
    address _owner,
    address _creator
  ) Ownable(_owner) {
    creator = _creator;
  }

  function updateCreator(address _creator) onlyOwner {
    creator = _creator;
  }

  function authorize(address token, address option) onlyCreator {
    authorizations[option] = token;
  }

  function transfer(address from, uint value) {
    address token = authorizations[msg.sender];
    require(token != address(0));

    require(ERC20(token).transferFrom(from, msg.sender, value));
  }
}
