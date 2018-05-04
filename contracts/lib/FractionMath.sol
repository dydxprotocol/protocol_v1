pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Fraction256 } from "./Fraction256.sol";


/**
 * @title FractionMath
 * @author dYdX
 *
 * This library contains safe math functions for manipulating fractions. All math relies on the
 * invariants in validate(). Namely that both numerator and denominator are 128 bits or fewer, and
 * that the denominator is nonzero.
 */
library FractionMath {
    using SafeMath for uint256;

    /**
     * Adds a to b
     */
    function add(
        Fraction256.Fraction memory a,
        Fraction256.Fraction memory b
    )
        internal
        pure
        returns (Fraction256.Fraction memory)
    {
        uint256 left = a.num.mul(b.den);
        uint256 right = b.num.mul(a.den);
        uint256 denominator = a.den.mul(b.den);

        // prevent overflows
        if (left + right < left) { // if left + right overflows...
            left = left.div(2);
            right = right.div(2);
            denominator = denominator.div(2);
        }

        return bound(
            Fraction256.Fraction({
                num: left.add(right),
                den: denominator
            })
        );

    }

    /**
     * Subtracts 1/d from a.
     */
    function sub1Over(
        Fraction256.Fraction memory a,
        uint256 d
    )
        internal
        pure
        returns (Fraction256.Fraction memory)
    {
        if (a.den % d == 0) {
            // do not bound; denominator is constant and numerator decreases
            return Fraction256.Fraction({
                num: a.num.sub(a.den.div(d)),
                den: a.den
            });
        }
        return bound(
            Fraction256.Fraction({
                num: a.num.mul(d).sub(a.den),
                den: a.den.mul(d)
            })
        );
    }

    /**
     * Divides a by d.
     */
    function div(
        Fraction256.Fraction memory a,
        uint256 d
    )
        internal
        pure
        returns (Fraction256.Fraction memory)
    {
        if (a.num % d == 0) {
            // do not bound; denominator is constant and numerator decreases
            return Fraction256.Fraction({
                num: a.num.div(d),
                den: a.den
            });
        }
        return bound(
            Fraction256.Fraction({
                num: a.num,
                den: a.den.mul(d)
            })
        );
    }

    /**
     * Multiplies a by b.
     */
    function mul(
        Fraction256.Fraction memory a,
        Fraction256.Fraction memory b
    )
        internal
        pure
        returns (Fraction256.Fraction memory)
    {
        return bound(
            Fraction256.Fraction({
                num: a.num.mul(b.num),
                den: a.den.mul(b.den)
            })
        );
    }

    /**
     * Overwrites and returns the fraction with the numerator and denominator bounded to being less
     * than 2**128. Attempts to keep the copied fraction as accurate as possible.
     */
    function bound(
        Fraction256.Fraction memory a
    )
        internal
        pure
        returns (Fraction256.Fraction memory)
    {
        uint256 max = a.num > a.den ? a.num : a.den;
        uint256 diff = (max >> 127);
        if (diff > 1) {
            a.num = a.num.div(diff);
            a.den = a.den.div(diff);
        }
        validate(a);
        return a;
    }

    function validate(
        Fraction256.Fraction memory a
    )
        internal
        pure
    {
        assert(a.num < 2**128 && a.den < 2**128 && a.den > 0);
    }

    function copy(
        Fraction256.Fraction memory a
    )
        internal
        pure
        returns (Fraction256.Fraction memory)
    {
        return Fraction256.Fraction({ num: a.num, den: a.den });
    }
}
