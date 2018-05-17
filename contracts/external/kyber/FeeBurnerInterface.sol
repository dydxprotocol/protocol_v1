pragma solidity 0.4.23;
pragma experimental "v0.5.0";


interface FeeBurnerInterface {
    function handleFees (uint tradeWeiAmount, address reserve, address wallet) external returns(bool);
}
