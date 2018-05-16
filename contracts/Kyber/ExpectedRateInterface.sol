pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import "./ERC20Interface.sol";


interface ExpectedRateInterface {
    function getExpectedRate(ERC20 src, ERC20 dest, uint srcQty) public view
        returns (uint expectedRate, uint slippageRate);
}
