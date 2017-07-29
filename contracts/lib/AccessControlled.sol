pragma solidity ^0.4.13;

import './Ownable.sol';

contract AccessControlled is Ownable {
    uint public accessDelay;
    uint public gracePeriodExpiration;

    mapping(address => bool) public authorized;
    mapping(address => uint256) public pendingAuthorizations;

    function AccessControlled(
        address _owner,
        uint _accessDelay,
        uint _gracePeriod
    ) Ownable(_owner) {
        accessDelay = _accessDelay;
        gracePeriodExpiration = block.timestamp + _gracePeriod;
    }

    modifier requiresAuthorization() {
        require(authorized[msg.sender]);
        _;
    }

    function grantAccess(
        address who
    ) onlyOwner {
        if (block.timestamp < gracePeriodExpiration) {
            authorized[who] = true;
        } else {
            pendingAuthorizations[who] = block.timestamp + accessDelay;
        }
    }

    function confirmAccess(
        address who
    ) onlyOwner {
        require(pendingAuthorizations[who] != 0);
        require(block.timestamp > pendingAuthorizations[who]);
        authorized[who] = true;
        delete pendingAuthorizations[who];
    }

    function revokeAccess(
        address who
    ) onlyOwner {
        authorized[who] = false;
        delete pendingAuthorizations[who];
    }
}
