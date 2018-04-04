pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Exponent } from "../../lib/Exponent.sol";
import { Fraction256 } from "../../lib/Fraction256.sol";
import { FractionMath } from "../../lib/FractionMath.sol";
import { MathHelpers } from "../../lib/MathHelpers.sol";


library InterestImpl {
    using SafeMath for uint256;
    using FractionMath for Fraction256.Fraction;

    // -----------------------
    // ------ Constants ------
    // -----------------------

    uint256 constant DEFAULT_PRECOMPUTE_PRECISION = 11;

    uint256 constant DEFAULT_MACLAURIN_PRECISION = 5;

    // -----------------------------------------
    // ---- Public Implementation Functions ----
    // -----------------------------------------

    /**
     * Returns total tokens owed after accruing interest. Continuously compounding and accurate to
     * roughly 10^18 decimal places. Continuously compounding interest follows the formula:
     * I = P * e^(R*T)
     *
     * @param  tokenAmount         Amount of tokens lent
     * @param  interestRate  Annual interest percentage times 10**18. (example: 5% = 5e16)
     * @param  secondsOfInterest   Number of seconds that interest has been accruing
     * @param  roundToTimestep     If non-zero, round number of seconds _up_ to the nearest multiple
     * @return                     Total amount of tokens owed. Greater than tokenAmount.
     */
    function getCompoundedInterest(
        uint256 tokenAmount,
        uint256 interestRate,
        uint256 secondsOfInterest,
        uint256 roundToTimestep
    )
        public
        pure
        returns (
            uint256
        )
    {
        Fraction256.Fraction memory percent = getCompoundedPercent(
            interestRate,
            secondsOfInterest,
            roundToTimestep
        );

        return safeMultiplyUint256ByFraction(tokenAmount, percent);
    }

    // ------------------------------
    // ------ Helper Functions ------
    // ------------------------------

    /**
     * Returns a fraction estimate of E^(R*T)
     *
     * @param  interestRate  R in the equation; Annual interest percentage times 10**18
     * @param  secondsOfInterest   T in the equation; Number of seconds of accruing interest
     * @param  roundToTimestep     Modifies T by rounding it up to the nearest multiple
     * @return                     E^(R*T)
     */
    function getCompoundedPercent(
        uint256 interestRate,
        uint256 secondsOfInterest,
        uint256 roundToTimestep
    )
        internal
        pure
        returns (Fraction256.Fraction memory)
    {
        uint256 interestTime = roundUpToTimestep(secondsOfInterest, roundToTimestep);

        Fraction256.Fraction memory rt = Fraction256.Fraction({
            num: interestRate.mul(interestTime),
            den: (10**18) * (1 years)
        });

        return Exponent.exp(rt, DEFAULT_PRECOMPUTE_PRECISION, DEFAULT_MACLAURIN_PRECISION);
    }

    /**
     * Round up a number of seconds to the nearest multiple of timeStep
     *
     * @param  numSeconds  The input in seconds
     * @param  timeStep    The size of the time multiple to round up to in seconds
     * @return             An integer multiple of timeStep
     */
    function roundUpToTimestep(
        uint256 numSeconds,
        uint256 timeStep
    )
        internal
        pure
        returns (uint256)
    {
        // don't modify numSeconds if timestep is 0 or 1
        if (timeStep <= 1) {
            return numSeconds;
        }

        // otherwise round numSeconds up to the nearest multiple of timeStep
        return MathHelpers.divisionRoundedUp(numSeconds, timeStep).mul(timeStep);
    }

    /**
     * Returns n * f, trying to prevent overflow as much as possible. Assumes that the numerator
     * and denominator of f are less than 2**128.
     */
    function safeMultiplyUint256ByFraction(
        uint256 n,
        Fraction256.Fraction memory f
    )
        internal
        pure
        returns (uint256)
    {
        uint256 term1 = n.div(2 ** 128); // first 128 bits
        uint256 term2 = n % (2 ** 128); // second 128 bits

        // uncommon scenario, requires n >= 2**128. calculates term1 = term1 * f
        if (term1 > 0) {
            term1 = term1.mul(f.num);
            uint numBits = MathHelpers.getNumBits(term1);

            // reduce rounding error by shifting all the way to the left before dividing
            term1 = MathHelpers.divisionRoundedUp(
                term1 << (uint256(256).sub(numBits)),
                f.den);

            // continue shifting or reduce shifting to get the right number
            if (numBits > 128) {
                term1 = term1 << (numBits.sub(128));
            } else if (numBits < 128) {
                term1 = term1 >> (uint256(128).sub(numBits));
            }
        }

        // calculates term2 = term2 * f
        term2 = MathHelpers.getPartialAmountRoundedUp(
            f.num,
            f.den,
            term2
        );

        return term1.add(term2);
    }
}
