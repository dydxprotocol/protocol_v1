pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


library MathHelpers {
    using SafeMath for uint256;

    /**
     * Calculates partial value given a numerator and denominator.
     *
     * @param numerator    Numerator
     * @param denominator  Denominator
     * @param target       Value to calculate partial of
     * @return rounded-up result of target * numerator / denominator
     */
    function getPartialAmount(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        internal
        pure
        returns (
            uint256 result
        )
    {
        return numerator.mul(target).div(denominator);
    }

    /**
     * Calculates quotient given 3 numerators and 2 denominators
     *
     * @param numerator1    Numerator 1
     * @param numerator2    Numerator 2
     * @param numerator3    Numerator 3
     * @param denominator1  Denominator 1
     * @param denominator2  Denominator 2
     * @return rounded-up quotient
     */
    function getQuotient3Over2RoundedUp(
        uint256 numerator1,
        uint256 numerator2,
        uint256 numerator3,
        uint256 denominator1,
        uint256 denominator2
    )
        internal
        pure
        returns (
            uint256 quotient
        )
    {
        // Multiply everything before dividing to reduce rounding error as much as possible
        return divisionRoundedUp(
            numerator1.mul(numerator2).mul(numerator3),
            denominator1.mul(denominator2));
    }

    /**
     * Calculates partial value given a numerator and denominator, rounded up.
     *
     * @param numerator    Numerator
     * @param denominator  Denominator
     * @param target       Value to calculate partial of
     * @return rounded-up result of target * numerator / denominator
     */
    function getPartialAmountRoundedUp(
        uint256 numerator,
        uint256 denominator,
        uint256 target
    )
        internal
        pure
        returns (
            uint256 result
        )
    {
        return divisionRoundedUp(numerator.mul(target), denominator);
    }

    /**
     * Calculates division given a numerator and denominator, rounded up.
     *
     * @param numerator Numerator.
     * @param denominator Denominator.
     * @return rounded-up result of numerator / denominator
     */
    function divisionRoundedUp(
        uint256 numerator,
        uint256 denominator
    )
        internal
        pure
        returns (
            uint256 result
        )
    {
        assert(denominator != 0);
        if (numerator == 0) {
            return 0;
        }
        return numerator.sub(1).div(denominator).add(1);
    }

    /**
     * Calculates and returns the maximum value for a uint32 in solidity
     *
     * @return the maximum value for uint32
     */
    function maxUint32(
    )
        internal
        pure
        returns (
            uint32 max
        )
    {
        return 2 ** 32 - 1;
    }

    /**
     * Calculates and returns the maximum value for a uint256 in solidity
     *
     * @return the maximum value for uint256
     */
    function maxUint256(
    )
        internal
        pure
        returns (
            uint256 max
        )
    {
        return 2 ** 256 - 1;
    }
}
