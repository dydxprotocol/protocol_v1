pragma solidity 0.4.21;
pragma experimental "v0.5.0";


/**
 * @title Fraction256
 * @author dYdX
 *
 * This library contains an implementation for a fraction whose numerator and denominator can each
 * be stored within 256 bits.
 */
library Fraction256 {

    struct Fraction {
        uint256 num;
        uint256 den;
    }
}
