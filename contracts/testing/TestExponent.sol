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

import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
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
        pure
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
