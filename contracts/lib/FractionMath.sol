pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Fraction } from "./Fraction.sol";


/**
 * @title FractionMath
 * @author dYdX
 *
 * This library contains safe math functions for manipulating fractions.
 */
library FractionMath {
    using SafeMath for uint256;
    using SafeMath for uint128;

    /**
     * Adds a to b
     */
    function add(
        Fraction.Fraction128 memory a,
        Fraction.Fraction128 memory b
    )
        internal
        pure
        returns (Fraction.Fraction128 memory)
    {
        uint256 left = a.num.mul(b.den);
        uint256 right = b.num.mul(a.den);
        uint256 denominator = a.den.mul(b.den);

        // if left + right overflows, prevent overflow
        if (left + right < left) {
            left = left.div(2);
            right = right.div(2);
            denominator = denominator.div(2);
        }

        return bound(left.add(right), denominator);
    }

    /**
     * Subtracts 1/(2^d) from a.
     */
    function sub1Over(
        Fraction.Fraction128 memory a,
        uint128 d
    )
        internal
        pure
        returns (Fraction.Fraction128 memory)
    {
        if (a.den % d == 0) {
            return bound(
                a.num.sub(a.den.div(d)),
                a.den
            );
        }
        return bound(
            a.num.mul(d).sub(a.den),
            a.den.mul(d)
        );
    }

    /**
     * Divides a by d.
     */
    function div(
        Fraction.Fraction128 memory a,
        uint128 d
    )
        internal
        pure
        returns (Fraction.Fraction128 memory)
    {
        if (a.num % d == 0) {
            return bound(
                a.num.div(d),
                a.den
            );
        }
        return bound(
            a.num,
            a.den.mul(d)
        );
    }

    /**
     * Multiplies a by b.
     */
    function mul(
        Fraction.Fraction128 memory a,
        Fraction.Fraction128 memory b
    )
        internal
        pure
        returns (Fraction.Fraction128 memory)
    {
        return bound(
            a.num.mul(b.num),
            a.den.mul(b.den)
        );
    }

    /**
     * Returns a fraction from two uint256's. Fits them into uint128 if necessary.
     */
    /* solium-disable-next-line security/no-assign-params */
    function bound(
        uint256 num,
        uint256 den
    )
        internal
        pure
        returns (Fraction.Fraction128 memory)
    {
        uint256 max = num > den ? num : den;
        uint256 diff = (max >> 127);
        if (diff > 1) {
            num /= diff;
            den /= diff;
        }

        assert(den > 0 && den < 2**128 && num < 2**128);

        return Fraction.Fraction128({
            num: uint128(num),
            den: uint128(den)
        });
    }

    function validate(
        Fraction.Fraction128 memory a
    )
        internal
        pure
    {
        assert(a.den > 0);
    }

    function copy(
        Fraction.Fraction128 memory a
    )
        internal
        pure
        returns (Fraction.Fraction128 memory)
    {
        assert(a.den != 0);
        return Fraction.Fraction128({ num: a.num, den: a.den });
    }
}
