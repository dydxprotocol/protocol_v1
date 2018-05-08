pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Exponent } from "../lib/Exponent.sol";
import { Fraction } from "../lib/Fraction.sol";
import { FractionMath } from "../lib/FractionMath.sol";
import { MathHelpers } from "../lib/MathHelpers.sol";


contract TestExponent {
    function exp(
        uint128 numerator,
        uint128 denominator,
        uint256 precomputePrecision,
        uint256 maclaurinPrecision
    )
        public
        returns (uint256, uint256)
    {
        Fraction.Fraction128 memory percent = Exponent.exp(
            Fraction.Fraction128({
                num: numerator,
                den: denominator
            }),
            precomputePrecision,
            maclaurinPrecision
        );

        return (percent.num, percent.den);
    }
}
