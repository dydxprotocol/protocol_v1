pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ShortSellState } from "./ShortSellState.sol";


contract ShortSellStorage {
    // ---------------------------
    // ----- State Variables -----
    // ---------------------------

    /**
     * Struct holding the entire state of ShortSell
     */
    ShortSellState.State state;
}
