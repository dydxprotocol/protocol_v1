pragma solidity 0.4.19;

import { Fraction256 } from "./Fraction256.sol";
import { FractionMath } from "./FractionMath.sol";
import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


library Exponent {
    using SafeMath for uint256;
    using FractionMath for Fraction256.Fraction;

    // -------------------------
    // ------ Constants --------
    // -------------------------

    // 2**128 - 1
    uint256 constant public MAX_NUMERATOR = 340282366920938463463374607431768211455;

    // Number such that e is approximated by (MAX_NUMERATOR / E_DENOMINATOR)
    uint256 constant public E_DENOMINATOR = 125182886983370532117250726298150828301;

    // -----------------------------------------
    // ---- Public Implementation Functions ----
    // -----------------------------------------

    /**
     * Returns e^X for any fraction X
     *
     * @param  numerator            Numerator of X
     * @param  denominator          Denominator of X
     * @param  precomputePrecision  Accuracy of precomputed terms
     * @param  maclaurinPrecision   Accuracy of Maclaurin terms
     * @return                      e^X
     */
    function exp(
        uint256 numerator,
        uint256 denominator,
        uint256 precomputePrecision,
        uint256 maclaurinPrecision
    )
        internal
        pure
        returns (Fraction256.Fraction memory)
    {
        assert(denominator > 0);
        if (numerator == 0) { // e^0 = 1
            return Fraction256.Fraction({ num: 1, den: 1 });
        }

        Fraction256.Fraction memory X = Fraction256.Fraction({ num: numerator, den: denominator });

        // get the value of the fraction (example: 9/4 is 2.25 so has integerValue of 2)
        uint256 integerValue = numerator.div(denominator);

        // if X is less than 1, then just calculate X
        if (integerValue == 0) {
            return expHybrid(X, precomputePrecision, maclaurinPrecision);
        }

        // subtract integerValue from X
        Fraction256.Fraction memory remainderX = Fraction256.Fraction({
            num: (numerator.sub(denominator.mul(integerValue))),
            den: denominator
        });

        // multiply e^integerValue by e^(remainderX)
        Fraction256.Fraction memory E = Fraction256.Fraction({
            num: MAX_NUMERATOR,
            den: E_DENOMINATOR
        });
        Fraction256.Fraction memory result = E;
        while (integerValue > 1) {
            integerValue--;
            result = result.mul(E);
        }
        return result.mul(expHybrid(remainderX, precomputePrecision, maclaurinPrecision));
    }

    /**
     * Returns e^X for any X < 1. Multiplies precomputed values to get close to the real value, then
     * Maclaurin Series approximation to reduce error.
     *
     * @param  X                    Exponent
     * @param  precomputePrecision  Accuracy of precomputed terms
     * @param  maclaurinPrecision   Accuracy of Maclaurin terms
     * @return                      e^X
     */
    function expHybrid(
        Fraction256.Fraction memory X,
        uint256 precomputePrecision,
        uint256 maclaurinPrecision
    )
        internal
        pure
        returns (Fraction256.Fraction memory)
    {
        assert(X.num < X.den);
        // will also throw if precomputePrecision is larger than the array length in getDenominator

        Fraction256.Fraction memory result = Fraction256.Fraction({ num: 1, den: 1 });
        uint256 d = 1;
        for (uint256 i = 1; i <= precomputePrecision; i++) {
            d *= 2;

            if (d.mul(X.num) >= X.den) {
                // otherwise we subtract 1/n from a
                X.num = X.num.sub(X.den.div(d));
                Fraction256.Fraction memory precomputedExp = Fraction256.Fraction({
                    num: MAX_NUMERATOR,
                    den: getPrecomputedDenominator(i)
                });
                result = result.mul(precomputedExp);
            }
        }
        return result.mul(expMaclaurin(X, maclaurinPrecision));
    }

    /**
     * Returns e^X for any X, using Maclaurin Series approximation
     *
     * @param  X           Exponent
     * @param  precision   Accuracy of Maclaurin terms
     * @return             e^X
     */
    function expMaclaurin(
        Fraction256.Fraction memory X,
        uint256 precision
    )
        internal
        pure
        returns (Fraction256.Fraction memory)
    {
        Fraction256.Fraction memory result = Fraction256.Fraction({ num: 1, den: 1 });
        Fraction256.Fraction memory Xtemp = Fraction256.Fraction({ num: 1, den: 1 });
        for (uint256 i = 1; i <= precision; i++) {
            Xtemp = Xtemp.mul(X.div(i));
            result = result.add(Xtemp);
        }
        return result;
    }

    // ------------------------------
    // ------ Helper Functions ------
    // ------------------------------

    /**
     * Returns a number such that:
     * MAX_NUMERATOR / getPrecomputedDenominator(index) = E^(1 / 2^index)
     */
    function getPrecomputedDenominator(
        uint256 index
    )
        internal
        pure
        returns (uint256)
    {
        return [
            125182886983370532117250726298150828301,
            206391688497133195273760705512282642279,
            265012173823417992016237332255925138361,
            300298134811882980317033350418940119802,
            319665700530617779809390163992561606014,
            329812979126047300897653247035862915816,
            335006777809430963166468914297166288162,
            337634268532609249517744113622081347950,
            338955731696479810470146282672867036734,
            339618401537809365075354109784799900812,
            339950222128463181389559457827561204959,
            340116253979683015278260491021941090650,
            340199300311581465057079429423749235412,
            340240831081268226777032180141478221816,
            340261598367316729254995498374473399540,
            340271982485676106947851156443492415142,
            340277174663693808406010255284800906112,
            340279770782412691177936847400746725466,
            340281068849199706686796915841848278311,
            340281717884450116236033378667952410919,
            340282042402539547492367191008339680733,
            340282204661700319870089970029119685699,
            340282285791309720262481214385569134454,
            340282326356121674011576912006427792656,
            340282346638529464274601981200276914173,
            340282356779733812753265346086924801364,
            340282361850336100329388676752133324799,
            340282364385637272451648746721404212564,
            340282365653287865596328444437856608255,
            340282366287113163939555716675618384724,
            340282366604025813553891209601455838559,
            340282366762482138471739420386372790954,
            340282366841710300958333641874363209044
        ][index];
    }
}
