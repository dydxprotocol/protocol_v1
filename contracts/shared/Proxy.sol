pragma solidity 0.4.18;

import 'zeppelin-solidity/contracts/token/ERC20.sol';
import 'zeppelin-solidity/contracts/ownership/NoOwner.sol';
import '../lib/AccessControlled.sol';
import '../lib/SafeMath.sol';

contract Proxy is AccessControlled, SafeMath, NoOwner {
    mapping(address => bool) public transferAuthorized;

    modifier requiresTransferAuthorization() {
        require(transferAuthorized[msg.sender]);
        _;
    }

    function Proxy(
    ) AccessControlled(1 days, 8 hours) public {
    }

    function grantTransferAuthorization(
        address who
    ) requiresAuthorization public {
        transferAuthorized[who] = true;
    }

    function revokeTransferAuthorization(
        address who
    ) requiresAuthorization public {
        delete transferAuthorized[who];
    }

    function ownerRevokeTransferAuthorization(
        address who
    ) onlyOwner public {
        delete transferAuthorized[who];
    }

    function transfer(
        address token,
        address from,
        uint value
    ) requiresTransferAuthorization public {
        require(ERC20(token).transferFrom(from, msg.sender, value));
    }

    function transferTo(
        address token,
        address from,
        address to,
        uint value
    ) requiresTransferAuthorization public {
        require(ERC20(token).transferFrom(from, to, value));
    }

    function available(
        address who,
        address token
    ) view public returns (
        uint _allowance
    ) {
        return min256(
            ERC20(token).allowance(who, address(this)),
            ERC20(token).balanceOf(who)
        );
    }
}
