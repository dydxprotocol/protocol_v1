pragma solidity 0.4.21;
pragma experimental "v0.5.0";

import { MathHelpers } from "../lib/MathHelpers.sol";
import { InterestImpl } from "../margin/impl/InterestImpl.sol";


contract TestInterestImpl {

    uint256 test = 1; // to keep these functions as non-pure for testing

    function TestInterestImpl()
        public
    {}

    function getCompoundedInterest(
        uint256 tokenAmount,
        uint256 interestRate,
        uint256 secondsOfInterest
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
            interestRate,
            secondsOfInterest
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
