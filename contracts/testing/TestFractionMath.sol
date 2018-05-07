pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { Fraction128 } from "../lib/Fraction128.sol";
import { FractionMath } from "../lib/FractionMath.sol";


contract TestFractionMath {
    using FractionMath for Fraction128.Fraction;

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
        Fraction128.Fraction memory p = Fraction128.Fraction({num: a, den: b});
        Fraction128.Fraction memory q = Fraction128.Fraction({num: c, den: d});
        Fraction128.Fraction memory r = p.add(q);
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
        Fraction128.Fraction memory p = Fraction128.Fraction({num: a, den: b});
        Fraction128.Fraction memory r = p.sub1Over(d);
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
        Fraction128.Fraction memory p = Fraction128.Fraction({num: a, den: b});
        Fraction128.Fraction memory r = p.div(d);
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
        Fraction128.Fraction memory p = Fraction128.Fraction({num: a, den: b});
        Fraction128.Fraction memory q = Fraction128.Fraction({num: c, den: d});
        Fraction128.Fraction memory r = p.mul(q);
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
        Fraction128.Fraction memory r = FractionMath.bound(a, b);
        return (r.num, r.den);
    }

    function validate(
        uint128 a,
        uint128 b
    )
        external
        pure
    {
        Fraction128.Fraction memory p = Fraction128.Fraction({num: a, den: b});
        p.validate();
    }

    function copy(
        uint128 a,
        uint128 b
    )
        external
        pure
        returns (uint128, uint128)
    {
        Fraction128.Fraction memory p = Fraction128.Fraction({num: a, den: b});
        Fraction128.Fraction memory r = p.copy();
        return (r.num, r.den);
    }
}
