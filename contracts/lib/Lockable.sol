pragma solidity 0.4.18;

import './Ownable.sol';

contract Lockable is Ownable {
    bool public locked;

    function Lockable() Ownable() public {
        locked = false;
    }

    modifier lockable() {
        require(!locked);
        _;
    }

    function lockdown() public onlyOwner {
        locked = true;
    }

    function unlock() public onlyOwner {
        locked = false;
    }
}
