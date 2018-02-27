pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


library MathHelpers {
    using SafeMath for uint256;

    /// @dev Calculates partial value given a numerator and denominator.
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to calculate partial of.
    /// @return Partial value of target.
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

    /// @dev Calculates quotient given 3 numerators and denominators
    /// @param numerator1   Numerator 1
    /// @param numerator2   Numerator 1
    /// @param numerator3   Numerator 1
    /// @param denominator1 Denominator 1
    /// @param denominator2 Denominator 2
    /// @return Quotient
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
        // We multiply everything before dividing to reduce rounding error as much as possible,
        // but this can also potentially introduce an overflow error
        return divisionRoundedUp(
            numerator1.mul(numerator2).mul(numerator3),
            denominator1.mul(denominator2));
    }

    /// @dev Calculates partial value given a numerator and denominator, rounded up.
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to calculate partial of.
    /// @return Partial value of target.
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
     * NOTE: Potential overflow on `numerator.add(denominator)`. We can also do
     * `numerator.sub(1).div(denominator).add(1)` which will not have as much of an overflow
     * problem, but will require an extra check for `(numerator == 0)` in order to prevent underflow
     *
     * @param numerator Numerator.
     * @param denominator Denominator.
     * @return Result
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
        return numerator.add(denominator).sub(1).div(denominator);
    }
}
