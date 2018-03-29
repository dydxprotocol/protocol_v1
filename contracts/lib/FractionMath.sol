pragma solidity 0.4.19;

import { Fraction256 } from "./Fraction256.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


library FractionMath {
    using SafeMath for uint256;

    function add(
        Fraction256.Fraction memory a,
        Fraction256.Fraction memory b
    )
        pure
        internal
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

    function sub(
        Fraction256.Fraction memory a,
        Fraction256.Fraction memory b
    )
        pure
        internal
        returns (Fraction256.Fraction memory)
    {
        return bound(
            Fraction256.Fraction({
                num: (a.num.mul(b.den)).sub(b.num.mul(a.den)),
                den: a.den.mul(b.den)
            })
        );
    }

    function div(
        Fraction256.Fraction memory a,
        uint256 d
    )
        pure
        internal
        returns (Fraction256.Fraction memory)
    {
        return bound(
            Fraction256.Fraction({
                num: a.num,
                den: a.den.mul(d)
            })
        );
    }

    function mul(
        Fraction256.Fraction memory a,
        Fraction256.Fraction memory b
    )
        pure
        internal
        returns (Fraction256.Fraction memory)
    {
        return bound(
            Fraction256.Fraction({
                num: a.num.mul(b.num),
                den: a.den.mul(b.den)
            })
        );
    }

    function mul(
        Fraction256.Fraction memory a,
        uint256 m
    )
        pure
        internal
        returns (Fraction256.Fraction memory)
    {
        return bound(
            Fraction256.Fraction({
                num: a.num.mul(m),
                den: a.den
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
        pure
        internal
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
        pure
        internal
    {
        assert(a.num < 2**128 && a.den < 2**128 && a.den > 0);
    }

    function copy(
        Fraction256.Fraction memory a
    )
        pure
        internal
        returns (Fraction256.Fraction memory)
    {
        return Fraction256.Fraction({ num: a.num, den: a.den });
    }
}
