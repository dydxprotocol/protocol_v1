pragma solidity 0.4.23;
pragma experimental "v0.5.0";


/**
 * @title Fraction
 * @author dYdX
 *
 * This library contains implementations for fraction structs.
 */
library Fraction {
    struct Fraction128 {
        uint128 num;
        uint128 den;
    }
}
