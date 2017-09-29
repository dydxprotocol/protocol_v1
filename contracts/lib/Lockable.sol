pragma solidity 0.4.15;

import './Ownable.sol';

contract Lockable is Ownable {
    bool public locked;

    function Lockable() Ownable() {
        locked = false;
    }

    modifier lockable() {
        require(!locked);
        _;
    }

    function lockdown() onlyOwner {
        locked = true;
    }

    function unlock() onlyOwner {
        locked = false;
    }
}
