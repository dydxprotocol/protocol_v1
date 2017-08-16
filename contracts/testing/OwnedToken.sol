pragma solidity ^0.4.13;

import '../lib/Ownable.sol';

contract OwnedToken is Ownable {
    uint supply;
    mapping(address => uint) balances;
    mapping (address => mapping (address => uint256)) allowed;

    event Transfer( address token, address from, address to, uint value);
    event Approval( address token, address owner, address spender, uint value);


    function issueTo(address who, uint amount) onlyOwner {
        balances[who] = balances[who] + amount;
    }

    function totalSupply() constant returns (uint _supply) {
        return supply;
    }

    function balanceOf( address who ) constant returns (uint value) {
        return balances[who];
    }

    function allowance( address owner, address spender ) constant returns (uint _allowance) {
        return allowed[owner][spender];
    }

    function symbol() constant returns (string) {
        return "dTest";
    }

    function name() constant returns (string) {
        return "dYdX Test Token";
    }

    function decimals() constant returns (uint8) {
        return 18;
    }

    function transfer( address to, uint value) returns (bool ok) {
        if (balances[msg.sender] >= value) {
            balances[msg.sender] -= value;
            balances[to] += value;
            Transfer(address(this), msg.sender, to, value);
            return true;
        } else {
            return false;
        }
    }

    function transferFrom( address from, address to, uint value) returns (bool ok) {
        if (balances[from] >= value && allowed[from][msg.sender] >= value) {
            balances[to] += value;
            balances[from] -= value;
            allowed[from][msg.sender] -= value;
            Transfer(address(this), from, to, value);
            return true;
        } else {
            return false;
        }
    }

    function approve( address spender, uint value ) returns (bool ok) {
        allowed[msg.sender][spender] = value;
        Approval(address(this), msg.sender, spender, value);
        return true;
    }
}
