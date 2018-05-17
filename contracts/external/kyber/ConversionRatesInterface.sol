pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import "./ERC20Interface.sol";


interface ConversionRatesInterface {

    function recordImbalance(
        ERC20 token,
        int buyAmount,
        uint rateUpdateBlock,
        uint currentBlock
    )
        external;

    function getRate(ERC20 token, uint currentBlockNumber, bool buy, uint qty) external view returns(uint);
}
