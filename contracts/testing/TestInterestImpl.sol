pragma solidity 0.4.19;

import { InterestImpl } from "../short/impl/InterestImpl.sol";
import { MathHelpers } from "../lib/MathHelpers.sol";


contract TestInterestImpl {

    uint256 test = 1; // to keep these functions as non-pure for testing

    function TestInterestImpl()
        public
    {}

    function getCompoundedInterest(
        uint256 tokenAmount,
        uint256 annualInterestRate,
        uint256 secondsOfInterest,
        uint256 roundToTimestep
    )
        public
        returns (
            uint256
        )
    {
        if (false) {
            test = 1;
        }
        return InterestImpl.getCompoundedInterest(
            tokenAmount,
            annualInterestRate,
            secondsOfInterest,
            roundToTimestep
        );
    }

    function getInverseCompoundedInterest(
        uint256 tokenAmount,
        uint256 annualInterestRate,
        uint256 secondsOfInterest,
        uint256 roundToTimestep
    )
        public
        returns (uint256)
    {
        if (false) {
            test = 1;
        }
        return InterestImpl.getInverseCompoundedInterest(
            tokenAmount,
            annualInterestRate,
            secondsOfInterest,
            roundToTimestep
        );
    }

    function getNumBits(
        uint256 n
    )
        public
        returns (uint256)
    {
        if (false) {
            test = 1;
        }
        return MathHelpers.getNumBits(n);
    }
}
