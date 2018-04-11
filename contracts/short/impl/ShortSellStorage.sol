pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { ShortSellState } from "./ShortSellState.sol";


/**
 * @title ShortSellStorage
 * @author dYdX
 *
 * This contract serves as the storage for the entire state of ShortSell
 */
contract ShortSellStorage {

    ShortSellState.State state;

}
