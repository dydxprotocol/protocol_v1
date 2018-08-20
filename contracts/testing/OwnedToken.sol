/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";


contract OwnedToken is Ownable {
    uint256 supply;
    mapping (address => uint256) balances;
    mapping (address => mapping (address => uint256)) allowed;

    event Transfer(address token, address from, address to, uint256 value);
    event Approval(address token, address owner, address spender, uint256 value);


    function issueTo(address who, uint256 amount) onlyOwner external {
        balances[who] = balances[who] + amount;
    }

    function totalSupply() view public returns (uint256) {
        return supply;
    }

    function balanceOf(address who) view public returns (uint256) {
        return balances[who];
    }

    function allowance(address owner, address spender) view public returns (uint256) {
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

    function transfer(address to, uint256 value) public returns (bool) {
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

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
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

    function approve(address spender, uint256 value) public returns (bool) {
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
