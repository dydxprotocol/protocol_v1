pragma solidity 0.4.19;

import { InterestImpl } from "../short/impl/InterestImpl.sol";


contract TestInterestImpl {

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
        return InterestImpl.getInverseCompoundedInterest(
            tokenAmount,
            annualInterestRate,
            secondsOfInterest,
            roundToTimestep
        );
    }
}
