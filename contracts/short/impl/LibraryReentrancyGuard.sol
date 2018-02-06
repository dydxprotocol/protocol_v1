pragma solidity 0.4.19;

import { ShortSellState } from "./ShortSellState.sol";


library LibraryReentrancyGuard {
    function start(
        ShortSellState.State storage state
    )
        internal
    {
        require(!state.reentrancyGuard);
        state.reentrancyGuard = true;
    }

    function end(
        ShortSellState.State storage state
    )
        internal
    {
        state.reentrancyGuard = false;
    }
}
