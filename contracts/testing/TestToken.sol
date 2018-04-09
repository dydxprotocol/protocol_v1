pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


contract TestToken {
    using SafeMath for uint256;

    uint256 supply;
    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;

    event Transfer(address token, address from, address to, uint256 value);
    event Approval(address token, address owner, address spender, uint256 value);
    event Issue(address token, address owner, uint256 value);

    // Allow anyone to get new token
    function issue(uint256 amount) public {
        issueTo(msg.sender, amount);
    }

    function issueTo(address who, uint256 amount) public {
        supply = supply.add(amount);
        balances[who] = balances[who].add(amount);
        emit Issue(address(this), who, amount);
    }

    function totalSupply() public view returns (uint256) {
        return supply;
    }

    function balanceOf(address who ) public view returns (uint256) {
        return balances[who];
    }

    function allowance(address owner, address spender ) public view returns (uint256) {
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

    function transfer(address to, uint256 value) public returns (bool) {
        if (balances[msg.sender] >= value) {
            balances[msg.sender] -= value;
            balances[to] = balances[to].add(value);
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

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        if (balances[from] >= value && allowed[from][msg.sender] >= value) {
            balances[to] = balances[to].add(value);
            balances[from] = balances[from].sub(value);
            allowed[from][msg.sender] = allowed[from][msg.sender].sub(value);
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

    function approve(address spender, uint256 value ) public returns (bool) {
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
