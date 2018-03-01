pragma solidity 0.4.19;

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
