pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


contract InterestHelper {
    using SafeMath for uint256;

    // ---------------------
    // ------ Structs ------
    // ---------------------

    struct Fraction {
        uint256 num;
        uint256 den;
    }

    // -------------------------
    // ------ Constants ------
    // -------------------------

    Fraction public E;

    uint256 constant maxRounds = 11;
    // E^((1/2)^i)
    uint256[33] public BigArray = [
        340282366920938463463374607431768211455,
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
    ];

    // -------------------------
    // ------ Constructor ------
    // -------------------------

    function InterestHelper()
        public
    {
    }

    // ------------------------------
    // ------ Public Functions ------
    // ------------------------------

    /**
     * Returns total tokens owed after accruing interest. Continuously compounding and accurate to
     * roughly 10^18 decimal places.
     *
     * @param  tokenAmount         Amount of tokens lent
     * @param  annualInterestRate  Annual interest percentage times 10**18. (example: 5% = 5e16)
     * @param  secondsOfInterest   Number of seconds that interest has been accruing
     * @param  roundToDay          If true, round number of seconds _up_ to the nearest whole day
     * @return                     Total amount of tokens owed. Greater than tokenAmount.
     */
    function getCompoundedInterest(
        uint256 tokenAmount,
        uint256 annualInterestRate,
        uint256 secondsOfInterest,
        bool    roundToDay
    )
        public
        returns (
            uint256
        )
    {
        if (roundToDay) {
            secondsOfInterest = roundUpToNearestDay(secondsOfInterest);
        }
        Fraction memory X = Fraction({
            num: annualInterestRate * secondsOfInterest,
            den: (10**18) * (1 years)
        });

        Fraction memory eToTheX = exp(X);

        // return x * e^RT
        return tokenAmount.mul(eToTheX.num).div(eToTheX.den);
    }

    /**
     * Returns effective number of shares lent when lending after a delay.
     *
     * @param  tokenAmount         Amount of tokens lent
     * @param  annualInterestRate  Annual interest percentage times 10**18. (example: 5% = 5e16)
     * @param  secondsOfInterest   Number of seconds that interest has been accruing
     * @param  roundToDay          If true, round number of seconds _up_ to the nearest whole day
     * @return                     Effective number of tokens lent. Less than tokenAmount.
     */
    function getInverseCompoundedInterest(
        uint256 tokenAmount,
        uint256 annualInterestRate,
        uint256 secondsOfInterest,
        bool    roundToDay
    )
        public
        returns (uint256)
    {
        if (roundToDay) {
            secondsOfInterest = roundUpToNearestDay(secondsOfInterest);
        }
        Fraction memory X = Fraction({
            num: annualInterestRate * secondsOfInterest,
            den: (10**18) * (1 years)
        });

        Fraction memory eToTheX = exp(X);

        // return x / e^RT
        return tokenAmount.mul(eToTheX.den).div(eToTheX.num);
    }

    // ------------------------------
    // ------ Helper Functions ------
    // ------------------------------

    /**
     * Returns e^X for any fraction X
     *
     * @param  X  Exponent
     * @return e^X
     */
    function exp(
        Fraction memory X
    )
        internal
        view
        returns (Fraction memory)
    {
        if (X.num == 0) { // e^0 = 1
            return Fraction({ num: 1, den: 1 });
        }

        uint256 wholeNumberE = X.num.div(X.den);

        // No need for fancy shit
        if (wholeNumberE == 0) {
            return expHybrid(X);
        }

        Fraction memory remainderX = Fraction({ num: (X.num - X.den * wholeNumberE), den: X.den });
        Fraction memory result = E;
        while (wholeNumberE > 1) {
            wholeNumberE--;
            result = fMul(result, E);
        }

        return fMul(result, expHybrid(remainderX));
    }

    /**
     * Returns e^X for any X < 1. Multiplies precomputed values to get close to the real value, then
     * Maclaurin Series approximation to reduce error.
     *
     * @param  X  Exponent
     * @return e^X
     */
    function expHybrid(
        Fraction memory X
    )
        internal
        view
        returns (Fraction memory)
    {
        assert(X.num < X.den);

        Fraction memory result = Fraction({ num: 1, den: 1 });
        uint256 d = 1;
        for (uint256 i = 1; i <= maxRounds; i++) {
            d *= 2;

            if (d.mul(X.num) >= X.den) {
                // otherwise we subtract 1/n from a
                X.num = X.num.sub(X.den.div(d));
                result = fMul(result, Fraction({ num: 2**128-1, den: BigArray[i]}));
            }
        }
        return fMul(result, expMaclaurin(X, /*numTerms=*/ 5));
    }

    /**
     * Returns e^X for any X, using Maclaurin Series approximation
     *
     * @param  X  Exponent
     * @return e^X
     */
    function expMaclaurin(
        Fraction memory X,
        uint256 numTerms
    )
        internal
        pure
        returns (Fraction memory)
    {
        Fraction memory result = Fraction({ num: 1, den: 1 });
        Fraction memory Xtemp = Fraction({ num: 1, den: 1 });
        for (uint256 i = 1; i <= numTerms; i++) {
            Xtemp = fMul(Xtemp, fDiv(X, i));
            result = fAdd(result, Xtemp);
        }
        return result;
    }

    /**
     * Round up a number of seconds to the nearest number of whole days
     *
     * @param  numSeconds  The input
     * @return             The number of days in seconds
     */
    function roundUpToNearestDay(
        uint256 numSeconds
    )
        internal
        pure
        returns (uint256)
    {
        if (numSeconds == 0) {
            return 0;
        }
        return (1 days) * (numSeconds.sub(1) / (1 days));
    }

    // --------------------------------
    // ------ Fraction Functions ------
    // --------------------------------

    function fAdd(
        Fraction memory a,
        Fraction memory b
    )
        pure
        internal
        returns (Fraction memory)
    {
        return fBound(Fraction({
            num: (a.num.mul(b.den)).add(b.num.mul(a.den)),
            den: a.den.mul(b.den)
        }));
    }

    function fSub(
        Fraction memory a,
        Fraction memory b
    )
        pure
        internal
        returns (Fraction memory)
    {
        return fBound(Fraction({
            num: (a.num.mul(b.den)).sub(b.num.mul(a.den)),
            den: a.den.mul(b.den)
        }));
    }

    function fDiv(
        Fraction memory a,
        uint256 d
    )
        pure
        internal
        returns (Fraction memory)
    {
        return fBound(Fraction({
            num: a.num,
            den: a.den.mul(d)
        }));
    }

    function fMul(
        Fraction memory a,
        Fraction memory b
    )
        pure
        internal
        returns (Fraction memory)
    {
        return fBound(Fraction({
            num: a.num.mul(b.num),
            den: a.den.mul(b.den)
        }));
    }

    function fMul(
        Fraction memory a,
        uint256 m
    )
        pure
        internal
        returns (Fraction memory)
    {
        return fBound(Fraction({
            num: a.num.mul(m),
            den: a.den
        }));
    }

    /**
     * If necessary, reduces the numerator and denominator to be less than 2**127, attempting to
     * keep the fraction as accurate as possible
     */
    function fBound(
        Fraction memory a
    )
        pure
        internal
        returns (Fraction memory)
    {
        uint256 max = a.num > a.den ? a.num : a.den;
        uint256 diff = (max >> 127) + 1;
        if (diff > 1) {
            a.num = a.num.div(diff);
            a.den = a.den.div(diff);
        }
        fValid(a);
        return a;
    }

    function fValid(
        Fraction memory a
    )
        pure
        internal
    {
        assert(a.num < 2**127 && a.den < 2**127 && a.den > 0);
    }
}
