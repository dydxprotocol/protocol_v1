pragma solidity 0.4.23;
pragma experimental "v0.5.0";


/**
 * @title Fraction128
 * @author dYdX
 *
 * This library contains an implementation for a fraction whose numerator and denominator can each
 * be stored within 128 bits.
 */
library Fraction128 {
    struct Fraction {
        uint128 num;
        uint128 den;
    }
}
