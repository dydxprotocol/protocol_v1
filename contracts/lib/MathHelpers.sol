pragma solidity 0.4.19;

import { SafeMath } from "zeppelin-solidity/contracts/math/SafeMath.sol";


library MathHelpers {
    using SafeMath for uint;

    /// @dev Calculates partial value given a numerator and denominator.
    /// @param numerator Numerator.
    /// @param denominator Denominator.
    /// @param target Value to calculate partial of.
    /// @return Partial value of target.
    function getPartialAmount(
        uint numerator,
        uint denominator,
        uint target
    )
        internal
        pure
        returns (
            uint partialValue
        )
    {
        return numerator.mul(target).div(denominator);
    }
}
