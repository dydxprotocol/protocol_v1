pragma solidity 0.4.24;

import { SimpleMarketInterface } from "./SimpleMarketInterface.sol";


contract ExpiringMarketInterface is SimpleMarketInterface {

    // ============ Storage ================

    uint64 public close_time;

    bool public stopped;

    // ============ Functions ================

    function isClosed()
        public
        constant
        returns (bool closed);

    function getTime()
        public
        constant
        returns (uint64);
}
