pragma solidity 0.4.15;

import './lib/AccessControlled.sol';
import './interfaces/ERC20.sol';

contract Proxy is AccessControlled {
    mapping(address => bool) public transferAuthorized;

    modifier requiresTransferAuthorization() {
        require(transferAuthorized[msg.sender]);
        _;
    }

    function Proxy(
    ) AccessControlled(1 days, 8 hours) {
    }

    function grantTransferAuthorization(
        address who
    ) requiresAuthorization {
        transferAuthorized[who] = true;
    }

    function revokeTransferAuthorization(
        address who
    ) requiresAuthorization {
        delete transferAuthorized[who];
    }

    function ownerRevokeTransferAuthorization(
        address who
    ) onlyOwner {
        delete transferAuthorized[who];
    }

    function transfer(
        address token,
        address from,
        uint value
    ) requiresTransferAuthorization {
        require(ERC20(token).transferFrom(from, msg.sender, value));
    }

    function transferFrom(
        address token,
        address from,
        address to,
        uint value
    ) requiresTransferAuthorization {
        require(ERC20(token).transferFrom(from, to, value));
    }
}
