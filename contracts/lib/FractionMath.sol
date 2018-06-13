/*

    Copyright 2018 dYdX Trading Inc.

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.

*/

pragma solidity 0.4.24;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Fraction } from "./Fraction.sol";
import { Math512 } from "./Math512.sol";


/**
 * @title FractionMath
 * @author dYdX
 *
 * This library contains safe math functions for manipulating fractions.
 */
library FractionMath {
    using SafeMath for uint256;

    /**
     * Returns a Fraction256 that is equal to a + b
     *
     * @param  a  The first Fraction256
     * @param  b  The second Fraction256
     * @return    The result (sum)
     */
    function add(
        Fraction.Fraction256 memory a,
        Fraction.Fraction256 memory b
    )
        internal
        pure
        returns (Fraction.Fraction256 memory)
    {
        (uint256 l0, uint256 l1) = Math512.mul512(a.num, b.den);
        (uint256 r0, uint256 r1) = Math512.mul512(b.num, a.den);
        (uint256 d0, uint256 d1) = Math512.mul512(a.den, b.den);
        (uint256 n0, uint256 n1) = Math512.add512(l0, l1, r0, r1);
        return bound(n0, n1, d0, d1);
    }

    /**
     * Returns a Fraction256 that is equal to a - (1/2)^d
     *
     * @param  a  The Fraction256
     * @param  d  The power of (1/2)
     * @return    The result
     */
    function sub1Over(
        Fraction.Fraction256 memory a,
        uint256 d
    )
        internal
        pure
        returns (Fraction.Fraction256 memory)
    {
        if (a.den % d == 0) {
            return Fraction.Fraction256({
                num: a.num.sub(a.den.div(d)),
                den: a.den
            });
        }

        (uint256 n0, uint256 n1) = Math512.mul512(a.num, d);
        (n0, n1) = Math512.sub512(n0, n1, a.den, 0);
        (uint256 d0, uint256 d1) = Math512.mul512(a.den, d);

        return bound(n0, n1, d0, d1);
    }

    /**
     * Returns a Fraction256 that is equal to a / d
     *
     * @param  a  The first Fraction256
     * @param  d  The divisor
     * @return    The result (quotient)
     */
    function div(
        Fraction.Fraction256 memory a,
        uint256 d
    )
        internal
        pure
        returns (Fraction.Fraction256 memory)
    {
        assert(d != 0);

        if (a.num % d == 0) {
            return Fraction.Fraction256({
                num: a.num.div(d),
                den: a.den
            });
        }

        (uint256 d0, uint256 d1) = Math512.mul512(a.den, d);

        return bound(a.num, 0, d0, d1);
    }

    /**
     * Returns a Fraction256 that is equal to a * b.
     *
     * @param  a  The first Fraction256
     * @param  b  The second Fraction256
     * @return    The result (product)
     */
    function mul(
        Fraction.Fraction256 memory a,
        Fraction.Fraction256 memory b
    )
        internal
        pure
        returns (Fraction.Fraction256 memory)
    {
        (uint256 n0, uint256 n1) = Math512.mul512(a.num, b.num);
        (uint256 d0, uint256 d1) = Math512.mul512(a.den, b.den);
        return bound(n0, n1, d0, d1);
    }

    /**
     * Returns a fraction from two uint512's. Fits them into uint256 if necessary.
     *
     * @param  n0  The least-significant bits of the numerator
     * @param  n1  The most-significant bits of the numerator
     * @param  d0  The least-significant bits of the denominator
     * @param  d1  The most-significant bits of the denominator
     * @return     The Fraction256 that matches num/den most closely
     */
    /* solium-disable-next-line security/no-assign-params */
    function bound(
        uint256 n0,
        uint256 n1,
        uint256 d0,
        uint256 d1
    )
        internal
        pure
        returns (Fraction.Fraction256 memory)
    {
        (uint256 m0, uint256 m1) = Math512.max512(n0, n1, d0, d1);
        if (m1 != 0) {
            m1 += 1;
            (d0, d1) = Math512.div512(d0, d1, m1);
            (n0, n1) = Math512.div512(n0, n1, m1);
        }

        assert(d0 != 0 && d1 == 0 && n1 == 0); // unit-tested

        return Fraction.Fraction256({
            num: n0,
            den: d0
        });
    }

    /**
     * Returns an in-memory copy of a Fraction256
     *
     * @param  a  The Fraction256 to copy
     * @return    A copy of the Fraction256
     */
    function copy(
        Fraction.Fraction256 memory a
    )
        internal
        pure
        returns (Fraction.Fraction256 memory)
    {
        validate(a);
        return Fraction.Fraction256({ num: a.num, den: a.den });
    }

    // ============ Private Helper-Functions ============

    /**
     * Asserts that a Fraction256 is valid (i.e. the denominator is non-zero)
     *
     * @param  a  The Fraction256 to validate
     */
    function validate(
        Fraction.Fraction256 memory a
    )
        private
        pure
    {
        assert(a.den != 0); // unit-tested
    }
}
