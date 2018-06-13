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
import { Exponent } from "../../lib/Exponent.sol";
import { Fraction } from "../../lib/Fraction.sol";
import { FractionMath } from "../../lib/FractionMath.sol";
import { Math512 } from "../../lib/Math512.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


/**
 * @title InterestImpl
 * @author dYdX
 *
 * A library that calculates continuously compounded interest for principal, time period, and
 * interest rate.
 */
library InterestImpl {
    using SafeMath for uint256;
    using FractionMath for Fraction.Fraction256;

    // ============ Constants ============

    uint256 constant DEFAULT_PRECOMPUTE_PRECISION = 11;

    uint256 constant DEFAULT_MACLAURIN_PRECISION = 5;

    uint256 constant MAXIMUM_EXPONENT = 80;

    uint256 constant E_TO_MAXIUMUM_EXPONENT = 55406223843935100525711733958316613;

    // ============ Public Implementation Functions ============

    /**
     * Returns total tokens owed after accruing interest. Continuously compounding and accurate to
     * roughly 10^18 decimal places. Continuously compounding interest follows the formula:
     * I = P * e^(R*T)
     *
     * @param  principal           Principal of the interest calculation
     * @param  interestRate        Annual nominal interest percentage times 10**6.
     *                             (example: 5% = 5e6)
     * @param  secondsOfInterest   Number of seconds that interest has been accruing
     * @return                     Total amount of tokens owed. Greater than tokenAmount.
     */
    function getCompoundedInterest(
        uint256 principal,
        uint256 interestRate,
        uint256 secondsOfInterest
    )
        public
        pure
        returns (uint256)
    {
        // fraction representing (Rate * Time)
        Fraction.Fraction256 memory rt = Fraction.Fraction256({
            num: interestRate.mul(secondsOfInterest),
            den: (10**8) * (365 * 1 days)
        });

        // degenerate case: cap calculation
        if (rt.num.div(rt.den) >= MAXIMUM_EXPONENT) {
            return principal.mul(E_TO_MAXIUMUM_EXPONENT);
        }

        // calculate e^(RT)
        Fraction.Fraction256 memory eToRT = Exponent.exp(
            rt,
            DEFAULT_PRECOMPUTE_PRECISION,
            DEFAULT_MACLAURIN_PRECISION
        );

        // e^X for positive X should be greater-than or equal to 1
        assert(eToRT.num >= eToRT.den);

        (uint256 r0, uint256 r1) = Math512.mul512(principal, eToRT.num);
        (r0, r1) = Math512.div512(r0, r1, eToRT.den);

        assert(r1 == 0);

        return r0;
    }
}
