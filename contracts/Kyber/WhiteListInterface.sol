pragma solidity 0.4.23;
pragma experimental "v0.5.0";


contract WhiteListInterface {
    function getUserCapInWei(address user) external view returns (uint userCapWei);
}
