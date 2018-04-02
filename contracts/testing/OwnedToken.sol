pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import "zeppelin-solidity/contracts/ownership/Ownable.sol";


contract OwnedToken is Ownable {
    uint256 supply;
    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;

    event Transfer( address token, address from, address to, uint256 value);
    event Approval( address token, address owner, address spender, uint256 value);


    function issueTo(address who, uint256 amount) onlyOwner external {
        balances[who] = balances[who] + amount;
    }

    function totalSupply() view public returns (uint256 _supply) {
        return supply;
    }

    function balanceOf( address who ) view public returns (uint256 value) {
        return balances[who];
    }

    function allowance( address owner, address spender ) view public returns (uint256 _allowance) {
        return allowed[owner][spender];
    }

    function symbol() pure public returns (string) {
        return "dTest";
    }

    function name() pure public returns (string) {
        return "dYdX Test Token";
    }

    function decimals() pure public returns (uint8) {
        return 18;
    }

    function transfer( address to, uint256 value) public returns (bool ok) {
        if (balances[msg.sender] >= value) {
            balances[msg.sender] -= value;
            balances[to] += value;
            emit Transfer(
                address(this),
                msg.sender,
                to,
                value
            );
            return true;
        } else {
            return false;
        }
    }

    function transferFrom( address from, address to, uint256 value) public returns (bool ok) {
        if (balances[from] >= value && allowed[from][msg.sender] >= value) {
            balances[to] += value;
            balances[from] -= value;
            allowed[from][msg.sender] -= value;
            emit Transfer(
                address(this),
                from,
                to,
                value
            );
            return true;
        } else {
            return false;
        }
    }

    function approve( address spender, uint256 value ) public returns (bool ok) {
        allowed[msg.sender][spender] = value;
        emit Approval(
            address(this),
            msg.sender,
            spender,
            value
        );
        return true;
    }
}
