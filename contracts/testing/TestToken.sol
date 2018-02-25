pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


contract TestToken {
    using SafeMath for uint256;

    uint256 supply;
    mapping(address => uint) balances;
    mapping (address => mapping (address => uint256)) allowed;

    event Transfer(address token, address from, address to, uint value);
    event Approval(address token, address owner, address spender, uint value);
    event Issue(address token, address owner, uint value);

    // Allow anyone to get new token
    function issue(uint amount) public {
        issueTo(msg.sender, amount);
    }

    function issueTo(address who, uint amount) public {
        supply = supply.add(amount);
        balances[who] = balances[who].add(amount);
        Issue(address(this), who, amount);
    }

    function totalSupply() public view returns (uint _supply) {
        return supply;
    }

    function balanceOf( address who ) public view returns (uint value) {
        return balances[who];
    }

    function allowance( address owner, address spender ) public view returns (uint _allowance) {
        return allowed[owner][spender];
    }

    function symbol() public pure returns (string) {
        return "TEST";
    }

    function name() public pure returns (string) {
        return "Test Token";
    }

    function decimals() public pure returns (uint8) {
        return 18;
    }

    function transfer( address to, uint value) public returns (bool ok) {
        if (balances[msg.sender] >= value) {
            balances[msg.sender] -= value;
            balances[to] = balances[to].add(value);
            Transfer(
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

    function transferFrom( address from, address to, uint value) public returns (bool ok) {
        if (balances[from] >= value && allowed[from][msg.sender] >= value) {
            balances[to] = balances[to].add(value);
            balances[from] = balances[from].sub(value);
            allowed[from][msg.sender] = allowed[from][msg.sender].sub(value);
            Transfer(
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

    function approve( address spender, uint value ) public returns (bool ok) {
        allowed[msg.sender][spender] = value;
        Approval(
            address(this),
            msg.sender,
            spender,
            value
        );
        return true;
    }
}
