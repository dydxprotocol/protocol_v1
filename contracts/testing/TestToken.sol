pragma solidity 0.4.15;

contract TestToken {
    uint supply;
    mapping(address => uint) balances;
    mapping (address => mapping (address => uint256)) allowed;

    event Transfer(address token, address from, address to, uint value);
    event Approval(address token, address owner, address spender, uint value);
    event Issue(address token, address owner, uint value);

    // Allow anyone to get new token
    function issue(uint amount) {
        balances[msg.sender] = balances[msg.sender] + amount;
        Issue(address(this), msg.sender, amount);
    }

    function issueTo(address who, uint amount) {
        balances[who] = balances[who] + amount;
        Issue(address(this), who, amount);
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
        return "TEST";
    }

    function name() constant returns (string) {
        return "Test Token";
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
