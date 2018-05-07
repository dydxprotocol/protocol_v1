pragma solidity 0.4.23;
pragma experimental "v0.5.0";

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";
import { Exponent } from "../../lib/Exponent.sol";
import { Fraction128 } from "../../lib/Fraction128.sol";
import { FractionMath } from "../../lib/FractionMath.sol";
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
    using FractionMath for Fraction128.Fraction;

    // ============ Constants ============

    uint256 constant DEFAULT_PRECOMPUTE_PRECISION = 11;

    uint256 constant DEFAULT_MACLAURIN_PRECISION = 5;

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
        uint256 num = interestRate.mul(secondsOfInterest);

        // interestRate and secondsOfInterest should both be uint32
        assert(num < 2**128);

        Fraction128.Fraction memory rt = Fraction128.Fraction({
            num: uint128(num),
            den: (10**8) * (1 years)
        });

        Fraction128.Fraction memory percent = Exponent.exp(
            rt,
            DEFAULT_PRECOMPUTE_PRECISION,
            DEFAULT_MACLAURIN_PRECISION
        );

        // e^X for positive X should be greater-than or equal to 1
        assert(percent.num >= percent.den);

        return safeMultiplyUint256ByFraction(principal, percent);
    }

    // ============ Helper Functions ============

    /**
     * Returns n * f, trying to prevent overflow as much as possible. Assumes that the numerator
     * and denominator of f are less than 2**128.
     */
    function safeMultiplyUint256ByFraction(
        uint256 n,
        Fraction128.Fraction memory f
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
