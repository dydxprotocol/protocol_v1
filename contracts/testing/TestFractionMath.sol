pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { Fraction256 } from "../lib/Fraction256.sol";
import { FractionMath } from "../lib/FractionMath.sol";


contract TestFractionMath {
    using FractionMath for Fraction256.Fraction;

    function add(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d
    )
        external
        pure
        returns (uint256, uint256)
    {
        Fraction256.Fraction memory p = Fraction256.Fraction({num: a, den: b});
        Fraction256.Fraction memory q = Fraction256.Fraction({num: c, den: d});
        Fraction256.Fraction memory r = p.add(q);
        return (r.num, r.den);
    }

    function sub1Over(
        uint256 a,
        uint256 b,
        uint256 d
    )
        external
        pure
        returns (uint256, uint256)
    {
        Fraction256.Fraction memory p = Fraction256.Fraction({num: a, den: b});
        Fraction256.Fraction memory r = p.sub1Over(d);
        return (r.num, r.den);
    }

    function div(
        uint256 a,
        uint256 b,
        uint256 d
    )
        external
        pure
        returns (uint256, uint256)
    {
        Fraction256.Fraction memory p = Fraction256.Fraction({num: a, den: b});
        Fraction256.Fraction memory r = p.div(d);
        return (r.num, r.den);
    }

    function mul(
        uint256 a,
        uint256 b,
        uint256 c,
        uint256 d
    )
        external
        pure
        returns (uint256, uint256)
    {
        Fraction256.Fraction memory p = Fraction256.Fraction({num: a, den: b});
        Fraction256.Fraction memory q = Fraction256.Fraction({num: c, den: d});
        Fraction256.Fraction memory r = p.mul(q);
        return (r.num, r.den);
    }

    function bound(
        uint256 a,
        uint256 b
    )
        external
        pure
        returns (uint256, uint256)
    {
        Fraction256.Fraction memory p = Fraction256.Fraction({num: a, den: b});
        Fraction256.Fraction memory r = p.bound();
        return (r.num, r.den);
    }

    function validate(
        uint256 a,
        uint256 b
    )
        external
        pure
    {
        Fraction256.Fraction memory p = Fraction256.Fraction({num: a, den: b});
        p.validate();
    }

    function copy(
        uint256 a,
        uint256 b
    )
        external
        pure
        returns (uint256, uint256)
    {
        Fraction256.Fraction memory p = Fraction256.Fraction({num: a, den: b});
        Fraction256.Fraction memory r = p.copy();
        return (r.num, r.den);
    }
}
