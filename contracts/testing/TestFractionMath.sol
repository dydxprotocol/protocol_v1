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

import { Fraction } from "../lib/Fraction.sol";
import { FractionMath } from "../lib/FractionMath.sol";


contract TestFractionMath {
    using FractionMath for Fraction.Fraction128;

    function add(
        uint128 a,
        uint128 b,
        uint128 c,
        uint128 d
    )
        external
        pure
        returns (uint128, uint128)
    {
        Fraction.Fraction128 memory p = Fraction.Fraction128({num: a, den: b});
        Fraction.Fraction128 memory q = Fraction.Fraction128({num: c, den: d});
        Fraction.Fraction128 memory r = p.add(q);
        return (r.num, r.den);
    }

    function sub1Over(
        uint128 a,
        uint128 b,
        uint128 d
    )
        external
        pure
        returns (uint128, uint128)
    {
        Fraction.Fraction128 memory p = Fraction.Fraction128({num: a, den: b});
        Fraction.Fraction128 memory r = p.sub1Over(d);
        return (r.num, r.den);
    }

    function div(
        uint128 a,
        uint128 b,
        uint128 d
    )
        external
        pure
        returns (uint128, uint128)
    {
        Fraction.Fraction128 memory p = Fraction.Fraction128({num: a, den: b});
        Fraction.Fraction128 memory r = p.div(d);
        return (r.num, r.den);
    }

    function mul(
        uint128 a,
        uint128 b,
        uint128 c,
        uint128 d
    )
        external
        pure
        returns (uint128, uint128)
    {
        Fraction.Fraction128 memory p = Fraction.Fraction128({num: a, den: b});
        Fraction.Fraction128 memory q = Fraction.Fraction128({num: c, den: d});
        Fraction.Fraction128 memory r = p.mul(q);
        return (r.num, r.den);
    }

    function bound(
        uint256 a,
        uint256 b
    )
        external
        pure
        returns (uint128, uint128)
    {
        Fraction.Fraction128 memory r = FractionMath.bound(a, b);
        return (r.num, r.den);
    }

    function copy(
        uint128 a,
        uint128 b
    )
        external
        pure
        returns (uint128, uint128)
    {
        Fraction.Fraction128 memory p = Fraction.Fraction128({num: a, den: b});
        Fraction.Fraction128 memory r = p.copy();
        return (r.num, r.den);
    }
}
