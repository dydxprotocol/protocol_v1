pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { TestToken } from "./TestToken.sol";


contract ErroringToken is TestToken {

    function transfer(address, uint256) public returns (bool) {
        return false;
    }

    function transferFrom(address, address, uint256) public returns (bool) {
        return false;
    }

    function approve(address, uint256) public returns (bool) {
        return false;
    }
}
